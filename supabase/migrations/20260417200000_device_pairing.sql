-- DeskNote: device pairing codes, claim flow, location & theme metadata.
-- Prerequisites: `devices` table exists (see README). Run after prior migrations.

alter table public.devices
  alter column owner_id drop not null;

alter table public.devices
  add column if not exists pairing_code text,
  add column if not exists location_name text,
  add column if not exists theme text;

create unique index if not exists devices_pairing_code_unpaired_uidx
  on public.devices (pairing_code)
  where owner_id is null and pairing_code is not null;

-- ---------------------------------------------------------------------------
-- Normalize pairing input to digits-only (expect 6 digits on match)
-- ---------------------------------------------------------------------------

create or replace function public.desknote_normalize_pairing_code(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(trim(coalesce(raw, '')), '\D', '', 'g');
$$;

revoke all on function public.desknote_normalize_pairing_code(text) from public;

-- ---------------------------------------------------------------------------
-- Claim a device by pairing code (security definer — not expressible with RLS alone)
-- ---------------------------------------------------------------------------

create or replace function public.desknote_claim_device(
  p_pairing_code text,
  p_name text,
  p_location_name text,
  p_theme text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := public.desknote_normalize_pairing_code(p_pairing_code);
  v_device public.devices%rowtype;
  v_name text := nullif(trim(p_name), '');
  v_loc text := nullif(trim(coalesce(p_location_name, '')), '');
  v_theme text := lower(nullif(trim(coalesce(p_theme, '')), ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if length(v_norm) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  end if;

  if v_name is null or length(v_name) > 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if v_loc is not null and length(v_loc) > 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid_location');
  end if;

  if v_theme is null or v_theme not in ('cream', 'blush', 'plum', 'sage') then
    return jsonb_build_object('ok', false, 'error', 'invalid_theme');
  end if;

  select * into v_device
  from public.devices d
  where d.pairing_code = v_norm
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_not_found');
  end if;

  if v_device.owner_id is not null and v_device.owner_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  if v_device.owner_id = v_uid then
    return jsonb_build_object(
      'ok', true,
      'device_id', v_device.id,
      'already_yours', true
    );
  end if;

  insert into public.profiles (id) values (v_uid)
  on conflict (id) do nothing;

  update public.devices
  set
    owner_id = v_uid,
    name = v_name,
    location_name = v_loc,
    theme = v_theme,
    pairing_code = null
  where id = v_device.id;

  return jsonb_build_object('ok', true, 'device_id', v_device.id);
end;
$$;

revoke all on function public.desknote_claim_device(text, text, text, text) from public;
grant execute on function public.desknote_claim_device(text, text, text, text) to authenticated;
