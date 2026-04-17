-- DeskNote: persisted desk messages (separate from delivery queue in `notes`).
-- Prerequisites: `devices` (with `owner_id`), `auth.users`. Optional: `relationship_members` for partner visibility.

create table if not exists public.messages (
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

alter table public.messages enable row level security;

drop policy if exists "messages insert own to allowed devices" on public.messages;

-- Insert: only as yourself, and only to a device you or your linked partner owns.
create policy "messages insert own to allowed devices"
  on public.messages for insert
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from public.devices d
      where d.id = to_device_id
        and (
          d.owner_id = auth.uid()
          or d.owner_id = (select p.partner_id from public.profiles p where p.id = auth.uid())
          or exists (
            select 1
            from public.relationship_members me
            join public.relationship_members om
              on om.relationship_id = me.relationship_id
            where me.user_id = auth.uid()
              and om.user_id = d.owner_id
          )
        )
    )
  );

drop policy if exists "messages select visible" on public.messages;

-- Read: messages you sent or that arrived on a device you can see (same ownership rules).
create policy "messages select visible"
  on public.messages for select
  using (
    from_user_id = auth.uid()
    or exists (
      select 1 from public.devices d
      where d.id = messages.to_device_id
        and (
          d.owner_id = auth.uid()
          or d.owner_id = (select p.partner_id from public.profiles p where p.id = auth.uid())
          or exists (
            select 1
            from public.relationship_members me
            join public.relationship_members om
              on om.relationship_id = me.relationship_id
            where me.user_id = auth.uid()
              and om.user_id = d.owner_id
          )
        )
    )
  );
