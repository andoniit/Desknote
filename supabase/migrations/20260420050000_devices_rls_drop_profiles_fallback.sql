-- DeskNote: drop the profiles-based fallback in the devices RLS policy.
--
-- The mutual-profiles.partner_id branch added in
-- 20260420030000_devices_rls_partner_id_fallback.sql joined public.profiles
-- to itself, which re-triggered the profiles RLS policy and produced
-- "infinite recursion detected in policy for relation profiles". The
-- backfill in 20260420020000 already guarantees relationship_members is
-- populated for every mutual pair, and the invite flow inserts both rows
-- atomically for new pairings, so the fallback is redundant.

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
  );
