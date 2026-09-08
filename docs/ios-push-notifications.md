# DeskNote push notifications (iOS)

Status: **code complete, not yet provisioned** — the two Apple-side steps
below (push capability + an APNs auth key) have to be done once before any
phone is tapped on the shoulder.

```
Phone A sends ──INSERT──▶ Supabase `messages` table
                              │
              ┌───────────────┴───────────────┐
              │ webhook "messages-to-mqtt"    │ webhook "messages-to-push"
              ▼                               ▼
   Edge Function `mqtt-publish`      Edge Function `push-notify`
              │ HiveMQ → the desk               │ resolve to_device_id → owner
              ▼                                 │ read that owner's push_tokens
      Phone B's desk display                    ▼
                                          APNs → Phone B
                                                │ category DESK_NOTE
                                                ▼
                                  DeskNoteNotification.appex draws the card
```

The push carries **no message text** — only that a note is waiting, who
left it and on which desk. A secret one-time note therefore keeps its
secret on the lock screen, exactly as it does on the desk. Reading still
means opening the app or walking over to the display.

`messages` is the trigger rather than `notes` because the app inserts the
note first and the message second, deleting the notes again if that second
insert fails; a push on the note insert could announce a message that was
rolled back a moment later.

## 1. Apple, once

1. **Developer portal → Identifiers → `space.desknote.app`**: tick
   **Push Notifications**, save. (The widget and notification extensions
   need nothing — only the host app's App ID.)
2. **Keys → +** → tick **Apple Push Notifications service (APNs)** → name
   it, register, and download the `AuthKey_XXXXXXXXXX.p8` **once** — Apple
   never shows it again. Note the 10-character Key ID.
3. Re-download the provisioning profile (Xcode does this by itself with
   automatic signing) so the new entitlement is in it.

`DeskNote.entitlements` already declares `aps-environment:
$(APS_ENVIRONMENT)`, which `project.yml` sets to `development` for Debug
and `production` for Release. A Debug build's token only exists on the APNs
sandbox host and a TestFlight build's only on production, so
`push_tokens.environment` records which one each phone registered with and
`push-notify` picks the matching host.

## 2. Database

```sh
supabase db push          # 20260908120000_push_tokens.sql
```

It creates `public.push_tokens` (one row per installed app, keyed by the
APNs token) and `register_push_token(...)`, a `security definer` function
the app calls instead of writing the table directly — a phone the two of
you take turns signing in on has one token that has to move between
accounts, which RLS alone cannot express safely.

## 3. Edge Function secrets

| Variable           | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `APNS_KEY_ID`      | The 10-character Key ID from step 1                               |
| `APNS_TEAM_ID`     | `VG2N3XUNXB`                                                      |
| `APNS_PRIVATE_KEY` | The whole `.p8` file, `-----BEGIN PRIVATE KEY-----` lines included |
| `APNS_BUNDLE_ID`   | `space.desknote.app` (the app, not the extensions)                |
| `WEBHOOK_SECRET`   | The same one `mqtt-publish` already uses                          |

The key is multi-line, so set it from a file rather than the command line:

```sh
printf 'APNS_KEY_ID=XXXXXXXXXX\nAPNS_TEAM_ID=VG2N3XUNXB\nAPNS_BUNDLE_ID=space.desknote.app\n' > /tmp/apns.env
{ printf 'APNS_PRIVATE_KEY="'; sed -z 's/\n/\\n/g' AuthKey_XXXXXXXXXX.p8; printf '"\n'; } >> /tmp/apns.env
supabase secrets set --env-file /tmp/apns.env
rm /tmp/apns.env
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the runtime;
the function needs the service role because it reads the *recipient's*
tokens, and the recipient is never the caller.

```sh
supabase functions deploy push-notify --no-verify-jwt
```

## 4. Database webhook

A second trigger on the same table as the MQTT one:

```sql
drop trigger if exists "messages-to-push" on public.messages;
create trigger "messages-to-push"
  after insert on public.messages for each row
  execute function supabase_functions.http_request(
    'https://lareedskrwqleutgyskf.supabase.co/functions/v1/push-notify',
    'POST',
    '{"Content-type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
```

> Same dashboard gotcha as `mqtt-publish`: the header *name* and *value*
> are two separate boxes, and pasting both into one silently produces a 401
> on every call.

The function answers the webhook immediately and delivers in the
background (`EdgeRuntime.waitUntil`), so the 5 s timeout cannot kill a
delivery mid-flight.

## What the phone does

| Where | What |
| --- | --- |
| `ios/Sources/App/Cloud/PushNotifications.swift` | Asks once, right after sign-in; re-registers the APNs token on every launch (a token changes after a restore or an update); deletes its row before signing out |
| `ios/Sources/App/Views/NotificationsCard.swift` | The Settings row: turn it on later, or the way back to iOS Settings once it has been refused |
| `ios/Sources/Notification/` | The `DeskNoteNotification` content extension — the paper-note card a pulled-down notification opens into |

The extension links `UserNotificationsUI.framework` explicitly in
`project.yml`. Swift's autolinking does not pull it in from `import` alone,
and without it the extension launches, fails to find
`_UNNotificationContentExtensionVendorContext`, and shows a blank white
sheet instead of the card.

## Testing without a phone

The simulator takes a push straight from a file — no APNs, no key, no
signing:

```sh
xcrun simctl push booted space.desknote.app payload.json
```

with a payload shaped like the one the function sends (permission must
have been granted in the app first):

```json
{
  "Simulator Target Bundle": "space.desknote.app",
  "aps": {
    "alert": { "title": "You have a message on your desk", "body": "Ani left it there for you 💌" },
    "sound": "default",
    "category": "DESK_NOTE",
    "thread-id": "desk-1"
  },
  "sender_name": "Ani",
  "desk_name": "the bedroom desk",
  "device_id": "<uuid>",
  "sent_at": "2026-09-08T17:41:22Z"
}
```

Drag the banner down to open the card. If it comes up blank, check the
extension's own log:

```sh
xcrun simctl spawn booted log show --last 2m \
  --predicate 'processImagePath CONTAINS "DeskNoteNotification"' --style compact
```

| Symptom | Likely cause |
| --- | --- |
| No notification at all | Permission never granted, or the payload has no `Simulator Target Bundle` |
| Banner shows, card is blank | `UserNotificationsUI.framework` not linked into the extension |
| Function log says `recipient has no registered phone` | That account has never opened the app, or signed out (which deletes the row) |
| APNs replies `BadDeviceToken` | Debug token sent to the production host or vice versa — check `push_tokens.environment` |
| APNs replies `403 InvalidProviderToken` | Wrong `APNS_KEY_ID` / `APNS_TEAM_ID`, or the key was revoked |
