-- Drop NOT NULL on legacy `public.devices` columns that the DeskNote
-- register route (app/api/device/register/route.ts) no longer populates.
--
-- The 20260416999900_legacy_schema_to_desknote.sql bridge copies values into
-- the new DeskNote columns (name, pairing_code, online, theme, owner_id) but
-- left NOT NULL constraints on the legacy columns. Inserting a fresh device
-- therefore fails with e.g.
--   null value in column "pair_code" of relation "devices"
--     violates not-null constraint
--
-- Each ALTER is wrapped in a DO block + information_schema check so the
-- migration is safe on databases that never had the legacy columns.

do $$
declare
  legacy_cols constant text[] := array[
    'pair_code',
    'device_name',
    'is_online',
    'theme_name',
    'owner_user_id',
    'claimed_by_user_id',
    'relationship_id'
  ];
  col text;
begin
  foreach col in array legacy_cols loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'devices'
        and column_name = col
    ) then
      execute format(
        'alter table public.devices alter column %I drop not null',
        col
      );
    end if;
  end loop;
end $$;
