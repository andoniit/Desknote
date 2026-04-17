-- Per-device API token (SHA-256 hash stored; plaintext shown once at /api/device/register).
alter table public.devices
  add column if not exists device_token_hash text;

comment on column public.devices.device_token_hash is
  'SHA-256 hex of device bearer token; set at factory/register. Null = legacy auth via DEVICE_API_KEY only.';
