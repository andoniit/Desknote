-- DeskNote: ensure profiles.display_name exists for user-chosen names.
-- Safe to run on fresh or existing DeskNote projects.

alter table public.profiles
  add column if not exists display_name text;

-- Clamp any obviously-bad values written by earlier clients.
update public.profiles
set display_name = nullif(btrim(display_name), '')
where display_name is not null;
