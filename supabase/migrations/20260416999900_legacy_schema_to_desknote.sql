-- DeskNote: bridge a legacy schema (relationships with user_a/user_b, devices.owner_user_id,
-- pair_code, device_name, messages with relationship_id + long content, device_settings)
-- into the shape expected by migrations 20260417100000+.
--
-- Run via `supabase db push` on a DB that still has the legacy tables.
-- BACK UP your project first. This rewrites public.relationships and public.messages when detected.

-- ---------------------------------------------------------------------------
-- 1) profiles.partner_id (DeskNote RLS paths)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists partner_id uuid references public.profiles (id);

-- Sync partners from legacy "pair of users" relationships (before we rename that table).
update public.profiles p
set partner_id = case
  when p.id = r.user_a_id then r.user_b_id
  when p.id = r.user_b_id then r.user_a_id
  else p.partner_id
end
from public.relationships r
where
  exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'relationships'
      and c.column_name = 'user_a_id'
  )
  and r.status = 'active'
  and p.id in (r.user_a_id, r.user_b_id);

-- ---------------------------------------------------------------------------
-- 2) notes + note_status (required by later migrations / app)
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.note_status as enum ('queued', 'delivered', 'seen');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  body text not null check (char_length(body) <= 140),
  status public.note_status default 'queued',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 3) devices — DeskNote column names + flags (keep legacy columns for safety)
-- ---------------------------------------------------------------------------

alter table public.devices
  add column if not exists owner_id uuid references public.profiles (id) on delete cascade;

update public.devices d
set owner_id = coalesce(d.owner_id, d.owner_user_id, d.claimed_by_user_id)
where d.owner_id is null;

alter table public.devices
  add column if not exists name text;

update public.devices d
set name = coalesce(d.name, d.device_name, 'Desk')
where d.name is null or trim(d.name) = '';

alter table public.devices
  add column if not exists pairing_code text;

update public.devices d
set pairing_code = coalesce(d.pairing_code, d.pair_code)
where d.pairing_code is null and d.pair_code is not null;

alter table public.devices
  add column if not exists location_name text;

alter table public.devices
  add column if not exists theme text;

update public.devices d
set theme = case lower(nullif(trim(coalesce(d.theme, d.theme_name, '')), ''))
  when 'cream' then 'cream'
  when 'blush' then 'blush'
  when 'plum' then 'plum'
  when 'sage' then 'sage'
  when 'rose' then 'blush'
  else 'cream'
end
where d.theme is null;

alter table public.devices
  add column if not exists online boolean;

update public.devices d
set online = coalesce(d.online, d.is_online, false)
where d.online is null;

-- Allow unpaired desks (DeskNote pairing migration drops NOT NULL on owner_id later).
alter table public.devices
  alter column owner_id drop not null;

-- Legacy required relationship_id; DeskNote allows null for unpaired hardware.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'devices'
      and column_name = 'relationship_id'
  ) then
    alter table public.devices alter column relationship_id drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) device_settings → devices (then drop extension table)
-- ---------------------------------------------------------------------------

alter table public.devices
  add column if not exists accent_color text;

alter table public.devices
  add column if not exists pinned_mode_enabled boolean;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'device_settings'
  ) then
    update public.devices d
    set
      accent_color = case
        when lower(ds.accent_color) in ('rose', 'blush', 'plum', 'sage', 'cream') then lower(ds.accent_color)
        when ds.accent_color ilike '#%' then 'rose'
        else coalesce(d.accent_color, 'rose')
      end,
      pinned_mode_enabled = coalesce(ds.pinned_mode, d.pinned_mode_enabled, false),
      theme = case lower(nullif(trim(coalesce(ds.theme_name, '')), ''))
        when 'cream' then 'cream'
        when 'blush' then 'blush'
        when 'plum' then 'plum'
        when 'sage' then 'sage'
        when 'rose' then 'blush'
        else coalesce(d.theme, 'cream')
      end
    from public.device_settings ds
    where ds.device_id = d.id;

    update public.devices d
    set
      accent_color = coalesce(d.accent_color, 'rose'),
      pinned_mode_enabled = coalesce(d.pinned_mode_enabled, false)
    where d.accent_color is null;

    drop table public.device_settings cascade;
  end if;
end $$;

-- Defaults if no device_settings table existed
update public.devices d
set accent_color = coalesce(d.accent_color, 'rose')
where d.accent_color is null;

update public.devices d
set pinned_mode_enabled = coalesce(d.pinned_mode_enabled, false)
where d.pinned_mode_enabled is null;

-- ---------------------------------------------------------------------------
-- 5) relationships — legacy pair row → DeskNote hub + members
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'relationships'
      and column_name = 'user_a_id'
  ) then
    -- Clear partial DeskNote tables from a failed earlier push, if any.
    drop table if exists public.relationship_invites cascade;
    drop table if exists public.relationship_members cascade;

    alter table public.relationships rename to relationships_legacy;

    create table public.relationships (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now()
    );

    insert into public.relationships (id, created_at)
    select rl.id, rl.created_at
    from public.relationships_legacy rl;

    alter table public.devices drop constraint if exists devices_relationship_id_fkey;

    alter table public.devices
      add constraint devices_relationship_id_fkey
      foreign key (relationship_id) references public.relationships (id);

    create table public.relationship_members (
      user_id uuid primary key references auth.users (id) on delete cascade,
      relationship_id uuid not null references public.relationships (id) on delete cascade,
      joined_at timestamptz not null default now()
    );

    create index if not exists relationship_members_relationship_id_idx
      on public.relationship_members (relationship_id);

    insert into public.relationship_members (user_id, relationship_id)
    select rl.user_a_id, rl.id
    from public.relationships_legacy rl
    where rl.user_a_id is not null
    on conflict (user_id) do nothing;

    insert into public.relationship_members (user_id, relationship_id)
    select rl.user_b_id, rl.id
    from public.relationships_legacy rl
    where rl.user_b_id is not null
    on conflict (user_id) do nothing;
  end if;
end $$;

-- If relationship_members already existed (e.g. partial migrate) but is empty, backfill from legacy.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'relationships_legacy')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'relationship_members')
  then
    insert into public.relationship_members (user_id, relationship_id)
    select rl.user_a_id, rl.id
    from public.relationships_legacy rl
    where rl.user_a_id is not null
    on conflict (user_id) do nothing;

    insert into public.relationship_members (user_id, relationship_id)
    select rl.user_b_id, rl.id
    from public.relationships_legacy rl
    where rl.user_b_id is not null
    on conflict (user_id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) messages — legacy row shape → DeskNote messages (then drop legacy name)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'relationship_id'
  ) then
    alter table public.messages rename to messages_legacy;

    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      from_user_id uuid not null references auth.users (id) on delete cascade,
      to_device_id uuid not null references public.devices (id) on delete cascade,
      content text not null
        constraint messages_content_length check (char_length(content) >= 1 and char_length(content) <= 140),
      message_type text not null default 'standard'
        constraint messages_message_type_check
          check (message_type in ('standard', 'quick_send', 'system')),
      is_pinned boolean not null default false,
      created_at timestamptz not null default now()
    );

    create index if not exists messages_created_at_idx on public.messages (created_at desc);
    create index if not exists messages_from_user_idx on public.messages (from_user_id, created_at desc);
    create index if not exists messages_to_device_idx on public.messages (to_device_id, created_at desc);

    insert into public.messages (
      id,
      from_user_id,
      to_device_id,
      content,
      message_type,
      is_pinned,
      created_at
    )
    select
      m.id,
      m.from_user_id,
      m.to_device_id,
      left(m.content, 140),
      case m.message_type
        when 'preset' then 'quick_send'
        when 'heart' then 'quick_send'
        when 'system' then 'system'
        else 'standard'
      end,
      coalesce(m.is_pinned, false),
      m.created_at
    from public.messages_legacy m;

    drop table public.messages_legacy cascade;
  end if;
end $$;
