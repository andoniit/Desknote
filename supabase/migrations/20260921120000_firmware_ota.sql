-- DeskNote: over-the-air firmware updates for the ESP32 desks.
--
-- The pieces, in the order an update travels through them:
--
--   firmware_releases   one row per published build, written only by
--                       scripts/release-firmware.sh (service role). Carries
--                       the SHA-256 and the ECDSA signature the desk checks
--                       before it will boot anything.
--   storage "firmware"  the .bin files. PRIVATE: the binary has the shared
--                       HiveMQ login and DEVICE_API_KEY compiled in, and this
--                       repo is public. A desk gets a ten-minute signed URL
--                       from /api/device/latest, and only for the one version
--                       it has been asked to install.
--   devices.ota_*       the request and its progress. The owner asks through
--                       request_firmware_update(); the desk reports back
--                       through /api/device/ota and /api/device/latest.
--   "devices-to-mqtt"   pokes the desk over MQTT so it checks in now rather
--                       than at its next six-hourly sync. Also carries theme,
--                       name and card changes, which used to wait just as long.

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------

create table if not exists public.firmware_releases (
  -- Exactly the string the sketch has as kFirmwareVersion and reports in
  -- X-Firmware-Version; devices.firmware_version is compared against it
  -- verbatim, so the two must never drift. The release script enforces that.
  version text primary key
    constraint firmware_releases_version_check
      check (version ~ '^[A-Za-z0-9._-]{1,32}$'),
  storage_path text not null unique,
  size_bytes integer not null
    constraint firmware_releases_size_check check (size_bytes > 0 and size_bytes <= 4194304),
  sha256 text not null
    constraint firmware_releases_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  -- base64 of the DER ECDSA P-256 signature over the SHA-256 of the image.
  signature text not null,
  notes text,
  published_at timestamptz not null default now()
);

alter table public.firmware_releases enable row level security;

-- Anyone signed in may see what exists, so the app can say "update
-- available". Nobody but the service role writes.
drop policy if exists "firmware_releases readable" on public.firmware_releases;
create policy "firmware_releases readable"
  on public.firmware_releases for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Desk state
-- ---------------------------------------------------------------------------

alter table public.devices
  -- What the running firmware says it can do (X-Desk-Capabilities). 'sync'
  -- means it understands the MQTT poke below; 'ota' means it can install an
  -- update. Firmware from before this migration reports nothing, and must
  -- never be sent either: it would print {"kind":"sync"} as a love note.
  add column if not exists capabilities text[] not null default '{}',
  add column if not exists ota_target_version text
    references public.firmware_releases (version) on delete set null,
  add column if not exists ota_status text
    constraint devices_ota_status_check
      check (ota_status in ('requested', 'downloading', 'updated', 'failed')),
  add column if not exists ota_error text,
  add column if not exists ota_status_at timestamptz;

-- ---------------------------------------------------------------------------
-- Asking for an update
-- ---------------------------------------------------------------------------

-- The one door both apps use. It picks the newest release itself, so a
-- client cannot point a desk at an arbitrary version, and it refuses the
-- cases where pressing the button would quietly do nothing.
create or replace function public.request_firmware_update(p_device_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  desk public.devices%rowtype;
  newest text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into desk from public.devices where id = p_device_id;
  if not found or desk.owner_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  if not ('ota' = any (desk.capabilities)) then
    raise exception 'needs_usb_update';
  end if;

  select version into newest
  from public.firmware_releases
  order by published_at desc
  limit 1;

  if newest is null then
    raise exception 'no_release';
  end if;

  if newest = desk.firmware_version then
    raise exception 'up_to_date';
  end if;

  update public.devices
  set ota_target_version = newest,
      ota_status = 'requested',
      ota_error = null,
      ota_status_at = now()
  where id = p_device_id;

  return newest;
end;
$$;

revoke all on function public.request_firmware_update(uuid) from public;
grant execute on function public.request_firmware_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Private, and with no policies: only the service role reads or writes it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmware', 'firmware', false, 4194304, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- "devices-to-mqtt": tell the desk to check in
-- ---------------------------------------------------------------------------
--
-- Same approach as messages-to-push: the MQTT webhook on `messages` already
-- carries the mqtt-publish URL and WEBHOOK_SECRET, so both are read out of
-- its definition rather than pasted a second time.
--
-- The column list and WHEN clause are what keep this from looping. Every
-- /latest call writes last_seen_at, online, firmware_version and
-- capabilities; none of those are listed, so a desk checking in never pokes
-- itself into checking in again. Clearing ota_target_version (done when an
-- update lands or fails) is excluded too — only a new request pokes.

do $$
declare
  source_def text;
  secret text;
  function_url text;
begin
  if to_regnamespace('supabase_functions') is null then
    raise notice
      'supabase_functions schema absent — no Database Webhooks on this project; skipping devices-to-mqtt';
    return;
  end if;

  select pg_get_triggerdef(t.oid) into source_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'messages'
    and not t.tgisinternal
    and pg_get_triggerdef(t.oid) ilike '%mqtt-publish%'
    and pg_get_triggerdef(t.oid) ilike '%x-webhook-secret%'
  limit 1;

  if source_def is null then
    raise notice
      'no mqtt-publish webhook on public.messages to copy from; skipping devices-to-mqtt';
    return;
  end if;

  function_url := (regexp_match(source_def, 'http_request\s*\(\s*''([^'']*mqtt-publish[^'']*)''', 'i'))[1];
  secret := (regexp_match(source_def, '"x-webhook-secret"\s*:\s*"([^"]*)"', 'i'))[1];

  if function_url is null or secret is null or secret = '' then
    raise exception
      'found the mqtt-publish webhook on public.messages but could not read its URL and secret';
  end if;

  execute 'drop trigger if exists "devices-to-mqtt" on public.devices';
  execute format(
    'create trigger "devices-to-mqtt" '
    || 'after update of name, location_name, theme, accent_color, note_card_background, ota_target_version '
    || 'on public.devices for each row '
    || 'when ('
    || '  old.name is distinct from new.name'
    || '  or old.location_name is distinct from new.location_name'
    || '  or old.theme is distinct from new.theme'
    || '  or old.accent_color is distinct from new.accent_color'
    || '  or old.note_card_background is distinct from new.note_card_background'
    || '  or (new.ota_target_version is not null'
    || '      and new.ota_target_version is distinct from old.ota_target_version)'
    || ') '
    || 'execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    function_url,
    'POST',
    jsonb_build_object(
      'Content-type', 'application/json',
      'x-webhook-secret', secret)::text,
    '{}',
    '5000');

  raise notice 'devices-to-mqtt now posts to %', function_url;
end $$;
