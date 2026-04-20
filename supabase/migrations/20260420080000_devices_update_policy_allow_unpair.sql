-- DeskNote: let the current owner unpair their desk.
--
-- The "devices update by owner" policy's WITH CHECK required the caller
-- to still equal owner_id after the update. unpairDeviceAction sets
-- owner_id = null, which makes that post-update check fail with 42501
-- ("new row violates row-level security policy"). Relax WITH CHECK so
-- the owner is allowed to hand the desk back to the unclaimed pool.
--
-- Security: USING still requires auth.uid() = owner_id, so only the
-- current owner can trigger the UPDATE. WITH CHECK simply permits the
-- new row to have the owner clear themselves out.

drop policy if exists "devices update by owner" on public.devices;

create policy "devices update by owner"
  on public.devices for update
  using (auth.uid() = owner_id)
  with check (
    owner_id is null
    or auth.uid() = owner_id
  );
