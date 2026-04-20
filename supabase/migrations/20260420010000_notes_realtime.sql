-- DeskNote: broadcast note inserts over Supabase Realtime so the device
-- long-poll endpoint (/api/device/wait) can unblock instantly when the
-- partner sends a message. Without this migration realtime events for
-- public.notes are silently dropped and the endpoint would always time out.
--
-- `add table` errors if the table is already in the publication, so the
-- statement is wrapped in a DO block that checks pg_publication_tables.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notes'
  ) then
    execute 'alter publication supabase_realtime add table public.notes';
  end if;
end $$;

-- REPLICA IDENTITY DEFAULT (primary key) is enough for INSERT events, but
-- if we ever want UPDATE/DELETE payloads for the app's "seen" status flips,
-- FULL gives us the previous row. Cheap on a small table.
alter table public.notes replica identity full;
