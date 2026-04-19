-- DeskNote: broadcast pairing / unpairing / profile-name changes over
-- Supabase Realtime so the other partner's app reacts immediately.
--
-- `supabase_realtime` is the default publication Supabase creates.
-- `add table` would fail if the table is already in the publication, so
-- each statement is wrapped in a DO block that checks pg_publication_tables.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'relationships'
  ) then
    execute 'alter publication supabase_realtime add table public.relationships';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'relationship_members'
  ) then
    execute 'alter publication supabase_realtime add table public.relationship_members';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;

-- REPLICA IDENTITY FULL lets clients receive the previous row values on
-- UPDATE / DELETE — useful because the relationship rows disappear when
-- a pair dissolves and both partners still need to notice the change.
alter table public.relationships replica identity full;
alter table public.relationship_members replica identity full;
