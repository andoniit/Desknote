-- Link each message to its delivery row in `notes` for seen / delivered status in history.
alter table public.messages
  add column if not exists note_id uuid references public.notes (id) on delete set null;

create index if not exists messages_note_id_idx on public.messages (note_id);

-- Allow senders to delete notes they created (rollback if message insert fails after notes).
drop policy if exists "notes delete own sender" on public.notes;
create policy "notes delete own sender"
  on public.notes for delete
  using (auth.uid() = sender_id);
