-- DeskNote: make the "devices visible to partners" RLS policy tolerate
-- legacy pairs whose link only exists on profiles.partner_id.
--
-- Before this migration the policy only recognised pairs through
-- relationship_members. Any couple who joined before relationship_members
-- existed - or whose row got lost on a partial join - would have their
-- partner's desk invisible even though the rest of the UI resolved the
-- partner correctly via desknote_my_partner()'s fallback path.
--
-- The backfill migration (20260420020000) repopulates relationship_members
-- from mutual profiles.partner_id pairs, but we also widen the policy so
-- the UI keeps working the *instant* profiles.partner_id is set (e.g. by
-- desknote_my_partner()'s self-healing update), without waiting for a
-- manual data migration.
--
-- Safety: the OR branch still requires a *mutual* link (A.partner = B AND
-- B.partner = A), so a one-sided partner_id set by mistake cannot leak
-- somebody else's devices.

drop policy if exists "devices visible to relationship partners" on public.devices;

create policy "devices visible to relationship partners"
  on public.devices for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.relationship_members me
      join public.relationship_members owner_member
        on owner_member.relationship_id = me.relationship_id
      where me.user_id = auth.uid()
        and owner_member.user_id = devices.owner_id
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
