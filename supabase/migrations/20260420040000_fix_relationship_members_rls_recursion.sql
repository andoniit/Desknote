-- DeskNote: break the RLS recursion that made relationship_members (and,
-- transitively, devices) unreadable.
--
-- Symptom seen in dev logs:
--   "infinite recursion detected in policy for relation relationship_members"
-- was returned for ordinary SELECTs against devices. Root cause: the
-- relationship_members "self read" policy had an EXISTS subquery against
-- public.relationship_members itself, which re-triggers the policy, which
-- subqueries the table again - Postgres detects the loop and aborts.
-- The "devices visible to relationship partners" policy also joined the
-- table, so any SELECT on devices flowed into the same trap.
--
-- Fix: collapse the self-join into a SECURITY DEFINER helper that reads
-- the caller's relationship_id exactly once, bypassing RLS. Policies
-- call the helper instead of re-querying the table.

create or replace function public.desknote_my_relationship_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select rm.relationship_id
  from public.relationship_members rm
  where rm.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.desknote_my_relationship_id() from public;
grant execute on function public.desknote_my_relationship_id() to authenticated;

-- ---------------------------------------------------------------------------
-- relationship_members: readable by yourself or by your partner
-- ---------------------------------------------------------------------------

drop policy if exists "relationship_members self read" on public.relationship_members;

create policy "relationship_members self read"
  on public.relationship_members for select
  using (
    user_id = auth.uid()
    or relationship_id = public.desknote_my_relationship_id()
  );

-- ---------------------------------------------------------------------------
-- relationships: readable by members (rewritten to avoid the subquery
-- chain that hit the same recursion path)
-- ---------------------------------------------------------------------------

drop policy if exists "relationships readable by members" on public.relationships;

create policy "relationships readable by members"
  on public.relationships for select
  using (id = public.desknote_my_relationship_id());

-- ---------------------------------------------------------------------------
-- devices: you own it, share a relationship with the owner, or are linked
-- mutually via profiles.partner_id (legacy-pair fallback retained).
-- ---------------------------------------------------------------------------

drop policy if exists "devices visible to relationship partners" on public.devices;

create policy "devices visible to relationship partners"
  on public.devices for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.relationship_members owner_member
      where owner_member.user_id = devices.owner_id
        and owner_member.relationship_id = public.desknote_my_relationship_id()
    )
    or exists (
      select 1
      from public.profiles mine
      join public.profiles owner_profile
        on owner_profile.id = mine.partner_id
       and mine.id = owner_profile.partner_id
      where mine.id = auth.uid()
        and owner_profile.id = devices.owner_id
    )
  );
