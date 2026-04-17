-- DeskNote: per-device appearance + pinned-message default for sends.
-- Run after device pairing / relationship migrations.

alter table public.devices
  add column if not exists accent_color text not null default 'rose'
    constraint devices_accent_color_check
      check (accent_color in ('rose', 'blush', 'plum', 'sage', 'cream'));

alter table public.devices
  add column if not exists pinned_mode_enabled boolean not null default false;

comment on column public.devices.accent_color is
  'Accent highlight for this desk (web UI; device firmware may read later).';

comment on column public.devices.pinned_mode_enabled is
  'When true, messages sent without an explicit pin flag default to pinned for this desk.';

drop policy if exists "devices update by owner" on public.devices;

create policy "devices update by owner"
  on public.devices for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
