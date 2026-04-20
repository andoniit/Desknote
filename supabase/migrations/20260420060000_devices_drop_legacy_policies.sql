-- DeskNote: drop any lingering legacy RLS policy on public.devices that
-- references removed columns (user_a_id / user_b_id on the pre-DeskNote
-- relationships table). The error surfaced in the app as
--   "column r.user_a_id does not exist"
-- on every SELECT against public.devices, even for rows the caller owns.
--
-- We can't reliably reach those policies by name (they were created by
-- migrations that predate this repo), so we defensively drop every
-- policy currently on public.devices and recreate the ones we need.
--
-- Policies recreated below mirror the current good state:
--   - SELECT: owner OR partner via desknote_my_relationship_id()
--     (20260420050000)
--   - UPDATE: owner only (20260417600000)
-- Any other SELECT/UPDATE/INSERT/DELETE policy dropped here was from the
-- removed couples schema and no longer applies.

do $$
declare
  p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.devices'::regclass
  loop
    execute format('drop policy if exists %I on public.devices', p.polname);
  end loop;
end $$;

-- Recreate the SELECT policy (owner + partner via relationship_members).
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

-- Recreate the UPDATE policy (owner-only, matches 20260417600000).
create policy "devices update by owner"
  on public.devices for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- INSERT goes through the /api/device/register route using the service role
-- key (never authenticated users), so no INSERT policy is needed for the
-- normal app flow. Nothing to recreate here.
