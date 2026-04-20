-- DeskNote: heal couples whose legacy profiles.partner_id link never got
-- corresponding relationship_members rows.
--
-- Symptom this fixes:
--   - Dashboard callout says "Paired with <partner>" (served by
--     desknote_my_partner(), which has a profiles.partner_id fallback).
--   - But fetchPairedDevicesForUser() and the devices RLS policy both go
--     *only* through relationship_members, so the partner's desk is
--     invisible on /dashboard and /devices and the "owner + partner" pair
--     can never message each other.
--
-- Strategy:
--   1. For every mutual profiles.partner_id pair (A.partner = B AND
--      B.partner = A) where neither user already belongs to a
--      relationship, create a fresh relationships row and insert both
--      members.
--   2. For a mutual pair where *one* user is already in a relationship,
--      attach the other user to that same relationship_id so they share
--      state.
--
-- Safe to re-run: everything is gated on "not exists" / duplicate checks.

do $$
declare
  r record;
  v_rel_a uuid;
  v_rel_b uuid;
  v_new_rel uuid;
begin
  for r in
    select a.id as user_a, b.id as user_b
    from public.profiles a
    join public.profiles b
      on b.id = a.partner_id
     and a.id = b.partner_id
    where a.id < b.id -- each pair only once
  loop
    select relationship_id into v_rel_a
    from public.relationship_members
    where user_id = r.user_a;

    select relationship_id into v_rel_b
    from public.relationship_members
    where user_id = r.user_b;

    if v_rel_a is not null and v_rel_b is not null then
      -- Both already linked. Nothing to do (even if to different
      -- relationships - we don't want to silently merge strangers).
      continue;
    end if;

    if v_rel_a is null and v_rel_b is null then
      insert into public.relationships default values
      returning id into v_new_rel;

      insert into public.relationship_members (user_id, relationship_id)
      values (r.user_a, v_new_rel), (r.user_b, v_new_rel)
      on conflict (user_id) do nothing;
      continue;
    end if;

    if v_rel_a is not null then
      insert into public.relationship_members (user_id, relationship_id)
      values (r.user_b, v_rel_a)
      on conflict (user_id) do nothing;
    else
      insert into public.relationship_members (user_id, relationship_id)
      values (r.user_a, v_rel_b)
      on conflict (user_id) do nothing;
    end if;
  end loop;
end $$;
