-- DeskNote: mutual-consent unpair flow.
-- One partner requests, the other confirms. A single person can never
-- dissolve the pair unilaterally; the requester can cancel their own request.

alter table public.relationships
  add column if not exists unpair_requested_by uuid
    references auth.users (id) on delete set null,
  add column if not exists unpair_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- RPC: toggle unpair.
--   * no request yet        -> record the caller as requester
--   * request by caller     -> cancel the request
--   * request by partner    -> dissolve the pair atomically
-- Returns { ok, state }  where state in
--   'requested' | 'cancelled' | 'dissolved'
-- and on error { ok:false, error:<code> }.
-- ---------------------------------------------------------------------------

create or replace function public.desknote_toggle_unpair()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_rel_id uuid;
  v_members int;
  v_requester uuid;
  v_other uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select rm.relationship_id into v_rel_id
  from public.relationship_members rm
  where rm.user_id = v_uid;

  if v_rel_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_pair');
  end if;

  select count(*)::int into v_members
  from public.relationship_members
  where relationship_id = v_rel_id;

  if v_members < 2 then
    return jsonb_build_object('ok', false, 'error', 'pair_incomplete');
  end if;

  select unpair_requested_by into v_requester
  from public.relationships
  where id = v_rel_id;

  if v_requester is null then
    update public.relationships
    set unpair_requested_by = v_uid,
        unpair_requested_at = now()
    where id = v_rel_id;
    return jsonb_build_object('ok', true, 'state', 'requested');
  elsif v_requester = v_uid then
    update public.relationships
    set unpair_requested_by = null,
        unpair_requested_at = null
    where id = v_rel_id;
    return jsonb_build_object('ok', true, 'state', 'cancelled');
  else
    select user_id into v_other
    from public.relationship_members
    where relationship_id = v_rel_id
      and user_id <> v_uid
    limit 1;

    update public.profiles set partner_id = null where id = v_uid;
    if v_other is not null then
      update public.profiles set partner_id = null where id = v_other;
    end if;

    delete from public.relationship_invites where relationship_id = v_rel_id;
    delete from public.relationship_members where relationship_id = v_rel_id;
    delete from public.relationships where id = v_rel_id;

    return jsonb_build_object('ok', true, 'state', 'dissolved');
  end if;
end;
$$;

revoke all on function public.desknote_toggle_unpair() from public;
grant execute on function public.desknote_toggle_unpair() to authenticated;
