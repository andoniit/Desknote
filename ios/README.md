# DeskNote for iOS

Native SwiftUI app for [DeskNote](../README.md) — the private couple message
board for two ESP32 desk displays.

**The web app and this app are separate builds that share one backend.**
Nothing in `ios/` is imported by Next.js, and nothing here imports from
`app/`, `components/`, or `lib/`. Both clients talk to the same Supabase
project with the same publishable key, so a note written on the phone shows
up in the browser and on the desks, and vice versa.

## Getting started

```bash
cd ios && ./configure.sh && ./build.sh
```

`configure.sh` reads `../.env.local` and writes `Resources/supabase.json`
(gitignored). `build.sh` regenerates the Xcode project with XcodeGen,
builds for the simulator, and installs and launches on whichever simulator
is booted — pass a UDID as the first argument to pick one.

To work in Xcode instead:

```bash
cd ios && xcodegen generate && open DeskNote.xcodeproj
```

`DeskNote.xcodeproj` is generated and gitignored — **edit `project.yml`, not
the project file**. Adding a Swift file under `Sources/` needs no project
edit at all; the folder is the source list:

| Folder | Compiled into |
| --- | --- |
| `Sources/Shared/` | both the app and the widget |
| `Sources/App/` | the app |
| `Sources/Widget/` | the widget extension |
| `Sources/Notification/` | the notification content extension |

The notification extension takes two files out of `Sources/Shared/` by name
rather than the whole folder — see “Notifications” below.

Requirements: Xcode 16+, XcodeGen (`brew install xcodegen`), iOS 17 target.
The only package dependency is
[supabase-swift](https://github.com/supabase/supabase-swift).

## What it does

Feature parity with the web app:

| Screen | Web equivalent |
| --- | --- |
| Sign in — email + 6-digit PIN, signs up if the address is new | `/login` |
| Desk — composer, secret notes, sticker picker, quick taps, desk status, paged history | `/dashboard` |
| Pair — create or enter an invite code, two-sided unpair | `/relationship` |
| Devices — paired desks with live status, claim by six-digit code | `/devices` |
| Settings — account, display name, per-desk look, sign out | `/settings` |

Plus two things the web cannot do: a **home screen widget**, and a **push
notification** when a note lands on your desk.

## How it maps to the web app

The web does its writes in server actions. There is no server in front of
the phone, so each action is ported to a client call that performs the same
sequence against the same tables and RPCs. Row level security is what
authorises both — the queries carry no user filters of their own.

| Swift | Ported from |
| --- | --- |
| `App/Cloud/Messages.swift` | `app/actions/messages.ts`, `lib/messages/history.ts` |
| `App/Cloud/Devices.swift` | `app/actions/devices.ts` |
| `App/Cloud/Relationship.swift` | `app/actions/relationship.ts` |
| `App/Cloud/Profile.swift` | `app/actions/profile.ts`, `lib/profile/display-name.ts` |
| `Shared/DeskDirectory.swift` | `lib/data/paired-devices.ts`, `lib/relationship/partner.ts` |
| `Shared/DeskSnapshot.swift` | `app/api/device/latest/route.ts` |
| `Shared/Model/Validation.swift` | `lib/auth/pin.ts`, `lib/devices/validation.ts`, `lib/relationship/validation.ts` |
| `Shared/Model/DeskAppearance.swift` | `lib/devices/themes.ts`, `accents.ts`, `note-card-background.ts` |
| `Shared/Model/QuickPresets.swift` | `lib/messages/quick-presets.ts` |
| `Shared/Design/Palette.swift` | `tailwind.config.ts` colour tokens |

Two ports differ deliberately:

- **Unpairing a desk** runs as the signed-in user. The web uses the service
  role key, which a phone must never carry; migration `20260420080000`
  relaxed the `devices update by owner` policy's `WITH CHECK` to allow
  `owner_id is null`, so the authenticated update is enough.
- **Realtime** is one channel covering `messages`, `notes`, `devices`,
  `relationship_members`, `relationships`, and `profiles`. Any event
  triggers the same full reload that pull-to-refresh does — the phone's
  equivalent of the web's `router.refresh()`.

## Releasing to TestFlight

`./release.sh` archives, signs, and exports `build/export/DeskNote.ipa`;
`./release.sh --upload` also sends it. Every upload needs a build number App
Store Connect has not seen before — see the header of the script.

### Xcode Cloud

Two of this project's build inputs are generated rather than committed:
`DeskNote.xcodeproj` (XcodeGen) and `Resources/supabase.json`
(`configure.sh`). A fresh clone has neither, which is why a cloud build
fails immediately with *"Project DeskNote.xcodeproj does not exist at
ios/DeskNote.xcodeproj"* — it never reaches the compiler.

`ci_scripts/ci_post_clone.sh` rebuilds both. Xcode Cloud looks for that
directory either at the repository root or beside the Xcode project
depending on how the workflow was created, so `ios/ci_scripts/` holds a
three-line forwarder to the same script and either location works.

The workflow needs two environment variables, which is where
`configure.sh` reads from when there is no `.env.local`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lareedskrwqleutgyskf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same publishable key the web bundle ships |

Neither needs to be marked secret — the web app already hands both to every
visitor, and row level security is what protects the data.

## App icon

`DeskNote.icon` is an Icon Composer bundle (Xcode 26+): a layer PNG plus
`icon.json` describing the fill, shadow, and translucency that iOS composites
per appearance. It is referenced from `project.yml` with `type: file` — it is
a bundle, not a folder of loose resources — and selected via
`ASSETCATALOG_COMPILER_APPICON_NAME`. Edit it by opening `DeskNote.icon` in
Icon Composer; no project change is needed. The widget has no icon of its
own — extensions inherit the host app's.

## Home screen widget

`Sources/Widget/` is a WidgetKit extension showing the message that is on a
desk display right now, in small and medium sizes. Tapping it opens
`desknote://desk?device=<uuid>`, which the app handles in `RootView` by
landing on the Desk tab and refreshing.

It picks the same message the hardware does. `/api/device/latest` hands the
desk the newest **queued** note addressed to that desk's owner and, when
nothing is queued, the most recent note that was not a one-time secret;
`Shared/DeskSnapshot.swift` makes that same choice from the phone. Secrets
are named but never revealed — the desk only shows one when someone taps it,
and so the widget says "a secret note is waiting" and nothing more.

Which desk a widget watches is a widget setting (`SelectDeskIntent`): "My
desk" or "Their desk". A pair has at most two, so it is a fixed choice
rather than a dynamic entity query — no network call to fill the picker.

### The App Group

The widget queries Supabase on its own rather than only redrawing what the
app last cached, because a note that arrives while the phone is in a pocket
should still reach the home screen. That needs the session, and
supabase-swift's default Keychain storage is scoped to the app's bundle id —
invisible to an extension with its own. So both targets share the App Group
**`group.space.desknote`**, and `AppGroupLocalStorage` puts the session
there instead. The trade-off is deliberate and worth knowing: the refresh
token sits in a container file (protected until first unlock) rather than
the Keychain. It is a session for one RLS-guarded project, not a password.

The app also pushes a snapshot into the same container after every refresh
and clears it on sign-out, so a note you just sent appears immediately
instead of waiting for WidgetKit's next budgeted refresh (~15 minutes).

**Running on a real device** needs the App Group registered: in the Apple
Developer portal, add `group.space.desknote` under Identifiers → App Groups
and enable it on both `space.desknote.app` and `space.desknote.app.widget`.
The simulator needs nothing. Without it, `containerURL(...)` returns nil,
the app falls back to its own Keychain and keeps working, and the widget
shows its "sign in" card forever.

## Notifications

When your partner sends to your desk, your phone is tapped on the shoulder:

> **You have a message on your desk**
> Ani left it there for you 💌

That is the whole notification. It never carries the note — pulling it down
opens a card in the app's own paper, saying who left it and on which desk,
and nothing more. Secret one-time notes therefore keep their secret on the
lock screen exactly as they do on the display, and reading anything still
means opening the app or walking over to the desk.

Three pieces, and only the first is in this folder:

| Piece | Where |
| --- | --- |
| Asking once after sign-in, registering the APNs token, forgetting it on sign-out | `Sources/App/Cloud/PushNotifications.swift`, with the Settings row in `Sources/App/Views/NotificationsCard.swift` |
| The card a pulled-down notification opens into | `Sources/Notification/` — the `DeskNoteNotification` content extension, claiming category `DESK_NOTE` |
| Deciding who to push and sending it | `supabase/functions/push-notify`, on a database webhook over `messages` |

The content extension compiles `Design/Palette.swift` and
`Model/RelativeTime.swift` out of `Sources/Shared/` rather than the whole
folder: it has nothing to fetch — everything it draws arrives in the
payload — so it does not link Supabase the way the other two targets do. It
does link `UserNotificationsUI.framework` explicitly, because Swift's
autolinking will not do it from `import` alone and the extension silently
draws a blank sheet without it.

**Before any of this reaches a real phone**, the App ID needs the Push
Notifications capability and the Supabase project needs an APNs auth key.
Both steps, the webhook SQL, and how to test the card on a simulator with
no key at all are in
[`docs/ios-push-notifications.md`](../docs/ios-push-notifications.md).

## Desk stickers

`Resources/emoji.json` is generated from `lib/emoji/supported.gen.ts`, which
is itself generated from `kEmoji` in the firmware sketch — so the picker only
offers glyphs the desk can actually draw. The glyphs live in the Material
Design Icons private use area, which is why
`Resources/Fonts/materialdesignicons-webfont.ttf` is bundled and registered
in `UIAppFonts`; `Design/DeskText.swift` splits message text into sticker and
non-sticker runs so each gets the right font.

When the firmware's emoji set changes, regenerate the web file and then:

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/emoji/supported.gen.ts","utf8");const re=/\{\s*char:\s*"((?:\\u[0-9a-fA-F]{4}|[^"])+)"\s*,\s*cp:\s*.(U\+[0-9A-F]+).\s*,\s*(?:name:\s*"([^"]*)"\s*,\s*)?(mdi:\s*true\s*,\s*)?(animated:\s*true\s*,\s*)?category:\s*"([^"]+)"\s*\}/g;const rows=[];let m;while((m=re.exec(s)))rows.push({char:JSON.parse(`"${m[1]}"`),cp:m[2],name:m[3]??m[2],mdi:!!m[4],animated:!!m[5],category:m[6]});fs.writeFileSync("ios/Resources/emoji.json",JSON.stringify(rows,null,2)+"\n");console.log("wrote",rows.length)'
```

## Supabase settings

The same ones the web app needs (see `../.env.example`): email provider on,
minimum password length 6 so a six-digit PIN is accepted, and numeric-only
passwords allowed. If "Confirm email" is on, a new account sees the
"check your inbox" notice and can sign in once they have clicked through.
