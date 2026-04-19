-- DeskNote: reliable "who is my partner?" lookup.
-- Client-side joins through relationship_members sometimes come back empty
-- on the non-caller row (RLS can silently filter the partner's row), and
-- an incomplete join long ago could leave profiles.partner_id = null while
-- relationship_members is perfectly healthy.
--
-- This RPC is the single source of truth: it reads relationship_members
-- as SECURITY DEFINER (no RLS), self-heals profiles.partner_id so other
-- code paths stay consistent, and returns
--   { partner_id: uuid, display_name: text | null, email: text | null }
-- or NULL when the caller is not paired. Email is read from auth.users
-- inside the SECURITY DEFINER so clients get a useful fallback label
-- even when the partner hasn't chosen a display name yet.

create or replace function public.desknote_my_partner()
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_other uuid;
  v_name text;
  v_email text;
begin
  if v_uid is null then
    return null;
  end if;

  select rm.relationship_id into v_rel
  from public.relationship_members rm
  where rm.user_id = v_uid;

  if v_rel is not null then
    select rm.user_id into v_other
    from public.relationship_members rm
    where rm.relationship_id = v_rel
      and rm.user_id <> v_uid
    limit 1;
  end if;

  -- Fallback for legacy pairs that only ever set profiles.partner_id.
  if v_other is null then
    select p.partner_id into v_other
    from public.profiles p
    where p.id = v_uid;
  end if;

  if v_other is null then
    return null;
  end if;

  -- Self-heal: keep profiles.partner_id in sync with relationship_members
  -- so RLS expressions, settings, and legacy code paths agree.
  update public.profiles
  set partner_id = v_other
  where id = v_uid
    and (profiles.partner_id is distinct from v_other);

  update public.profiles
  set partner_id = v_uid
  where id = v_other
    and (profiles.partner_id is distinct from v_uid);

  select p.display_name into v_name
  from public.profiles p
  where p.id = v_other;

  select u.email into v_email
  from auth.users u
  where u.id = v_other;

  return jsonb_build_object(
    'partner_id', v_other,
    'display_name', nullif(btrim(v_name), ''),
    'email', nullif(btrim(v_email), '')
  );
end;
$$;

revoke all on function public.desknote_my_partner() from public;
grant execute on function public.desknote_my_partner() to authenticated;
