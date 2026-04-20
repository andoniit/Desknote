-- DeskNote: clean RLS policies for profiles, notes, and messages.
--
-- Background:
--   Several pre-DeskNote policies survived on these tables. They joined
--   public.profiles to itself inside a policy, which triggered
--   "infinite recursion detected in policy for relation profiles" as
--   soon as the app INSERTed a note (the WITH CHECK clause queried
--   profiles, which re-ran the profiles policy, and so on). Sending any
--   message - even to your own desk - surfaced the error in the
--   composer.
--
-- Approach:
--   Drop every existing policy on profiles / notes / messages and
--   recreate only the ones DeskNote actually needs. All cross-ownership
--   checks go through desknote_my_relationship_id() (SECURITY DEFINER,
--   added in 20260420040000), which never recurses.

-- ---------------------------------------------------------------------------
-- Drop everything on these three tables
-- ---------------------------------------------------------------------------

do $$
declare
  tbl text;
  p record;
begin
  foreach tbl in array array['profiles', 'notes', 'messages'] loop
    for p in
      select polname
      from pg_policy
      where polrelid = format('public.%I', tbl)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', p.polname, tbl);
    end loop;
  end loop;
end $$;

-- Ensure RLS is enabled on all three (idempotent).
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: you can read/update your own, and read your partner's
--   (display name + partner_id). Never recurses: partner lookup uses the
--   SECURITY DEFINER helper, not a self-subquery.
-- ---------------------------------------------------------------------------

-- Helper: resolve the caller's partner id without triggering RLS on
-- profiles or relationship_members. Reads relationship_members first (the
-- authoritative source) and falls back to profiles.partner_id for legacy
-- pairs that skipped the invite flow.
create or replace function public.desknote_my_partner_id()
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_other uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select rm.relationship_id into v_rel
  from public.relationship_members rm
  where rm.user_id = v_uid;

  if v_rel is not null then
    select rm.user_id into v_other
    from public.relationship_members rm
    where rm.relationship_id = v_rel
      and rm.user_id <> v_uid
    limit 1;
  end if;

  if v_other is null then
    select p.partner_id into v_other
    from public.profiles p
    where p.id = v_uid;
  end if;

  return v_other;
end
$$;

revoke all on function public.desknote_my_partner_id() from public;
grant execute on function public.desknote_my_partner_id() to authenticated;

create policy "profiles self or partner read"
  on public.profiles for select
  using (
    id = auth.uid()
    or id = public.desknote_my_partner_id()
  );

create policy "profiles self update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles self insert"
  on public.profiles for insert
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- notes: sender inserts, sender + recipient read, sender deletes own.
--   "recipient" for DeskNote is either yourself or your partner.
-- ---------------------------------------------------------------------------

create policy "notes insert own"
  on public.notes for insert
  with check (
    sender_id = auth.uid()
    and (
      recipient_id = auth.uid()
      or recipient_id = public.desknote_my_partner_id()
    )
  );

create policy "notes select own or partner"
  on public.notes for select
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
    or sender_id = public.desknote_my_partner_id()
    or recipient_id = public.desknote_my_partner_id()
  );

create policy "notes update own sender"
  on public.notes for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "notes delete own sender"
  on public.notes for delete
  using (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- messages: same ownership model as notes, plus the "to_device_id must be
--   a desk owned by you or your partner" rule. Goes through the
--   SECURITY DEFINER helper, so no recursion.
-- ---------------------------------------------------------------------------

create policy "messages insert own to allowed devices"
  on public.messages for insert
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1
      from public.devices d
      where d.id = to_device_id
        and (
          d.owner_id = auth.uid()
          or d.owner_id = public.desknote_my_partner_id()
        )
    )
  );

create policy "messages select visible"
  on public.messages for select
  using (
    from_user_id = auth.uid()
    or exists (
      select 1
      from public.devices d
      where d.id = messages.to_device_id
        and (
          d.owner_id = auth.uid()
          or d.owner_id = public.desknote_my_partner_id()
        )
    )
  );
