-- Allow senders to remove their own rows (used to roll back if note queue insert fails).
create policy "messages delete own"
  on public.messages for delete
  using (from_user_id = auth.uid());
