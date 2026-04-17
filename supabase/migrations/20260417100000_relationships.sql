-- DeskNote: couples / relationships, invite codes, and shared device visibility.
-- Apply in Supabase SQL editor or via `supabase db push`.
--
-- Assumptions:
-- - `profiles` exists with `id uuid primary key references auth.users(id)` and `partner_id uuid`.
-- - `devices` and `notes` reference `profiles(id)` as in the project README.
-- - JWT includes `email` (Supabase Auth default for magic link / OAuth users).

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists relationship_members_relationship_id_idx
  on public.relationship_members (relationship_id);

create table if not exists public.relationship_invites (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  code_normalized text not null,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invited_email text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Only unconsumed invites must have globally unique codes.
create unique index if not exists relationship_invites_active_code_normalized_uidx
  on public.relationship_invites (code_normalized)
  where consumed_at is null;

create index if not exists relationship_invites_relationship_id_idx
  on public.relationship_invites (relationship_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.relationships enable row level security;
alter table public.relationship_members enable row level security;
alter table public.relationship_invites enable row level security;

drop policy if exists "relationships readable by members" on public.relationships;

create policy "relationships readable by members"
  on public.relationships for select
  using (
    exists (
      select 1 from public.relationship_members m
      where m.relationship_id = relationships.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "relationship_members self read" on public.relationship_members;

create policy "relationship_members self read"
  on public.relationship_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.relationship_members me
      where me.user_id = auth.uid()
        and me.relationship_id = relationship_members.relationship_id
    )
  );

drop policy if exists "relationship_invites readable by inviter" on public.relationship_invites;

create policy "relationship_invites readable by inviter"
  on public.relationship_invites for select
  using (inviter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Devices: partners in the same relationship can see each other's devices
-- ---------------------------------------------------------------------------

drop policy if exists "devices visible to relationship partners" on public.devices;

create policy "devices visible to relationship partners"
  on public.devices for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1
      from public.relationship_members me
      join public.relationship_members owner_member
        on owner_member.relationship_id = me.relationship_id
      where me.user_id = auth.uid()
        and owner_member.user_id = devices.owner_id
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers: normalize invite code (alphanumeric only, case-insensitive input)
-- ---------------------------------------------------------------------------

create or replace function public.desknote_normalize_invite_code(raw text)
returns text
language sql
immutable
strict
as $$
  select upper(regexp_replace(trim(coalesce(raw, '')), '[^a-zA-Z0-9]', '', 'g'));
$$;

revoke all on function public.desknote_normalize_invite_code(text) from public;

-- ---------------------------------------------------------------------------
-- RPC: create invite (returns display code + expiry)
-- ---------------------------------------------------------------------------

create or replace function public.desknote_create_invite(invited_email text default null)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
-- gen_random_bytes lives in pgcrypto (Supabase: extensions schema). A narrow search_path
-- makes the RPC fail with "function gen_random_bytes does not exist" and pairing breaks.
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_member_count int;
  v_code_raw text;
  v_normalized text;
  v_expires timestamptz := now() + interval '7 days';
  v_email_norm text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if invited_email is not null and length(trim(invited_email)) > 0 then
    v_email_norm := lower(trim(invited_email));
    if v_email_norm !~ '^[^@]+@[^@]+\.[^@]+$' then
      raise exception 'invalid_email';
    end if;
  else
    v_email_norm := null;
  end if;

  select rm.relationship_id into v_rel
  from public.relationship_members rm
  where rm.user_id = v_uid;

  if v_rel is not null then
    select count(*)::int into v_member_count
    from public.relationship_members m
    where m.relationship_id = v_rel;

    if v_member_count >= 2 then
      raise exception 'already_linked';
    end if;
  else
    insert into public.relationships default values
    returning id into v_rel;

    insert into public.relationship_members (user_id, relationship_id)
    values (v_uid, v_rel);
  end if;

  delete from public.relationship_invites i
  where i.relationship_id = v_rel
    and i.consumed_at is null;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 64 then
      raise exception 'invite_code_generation_exhausted';
    end if;
    v_code_raw := encode(gen_random_bytes(5), 'hex');
    v_normalized := public.desknote_normalize_invite_code(v_code_raw);
    begin
      insert into public.relationship_invites (
        relationship_id, code_normalized, inviter_id, invited_email, expires_at
      ) values (v_rel, v_normalized, v_uid, v_email_norm, v_expires);
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  code := substring(v_normalized from 1 for 5) || '-' || substring(v_normalized from 6 for 5);
  expires_at := v_expires;
  return next;
end;
$$;

revoke all on function public.desknote_create_invite(text) from public;
grant execute on function public.desknote_create_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: join with code (validates email-bound invites, capacity, self-join)
-- ---------------------------------------------------------------------------

create or replace function public.desknote_join_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_norm text := public.desknote_normalize_invite_code(p_code);
  v_inv public.relationship_invites%rowtype;
  v_members int;
  v_jwt_email text;
  v_existing uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if length(v_norm) < 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_inv
  from public.relationship_invites i
  where i.code_normalized = v_norm
    and i.consumed_at is null
  order by i.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_not_found');
  end if;

  if v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;

  if v_inv.inviter_id = v_uid then
    return jsonb_build_object('ok', false, 'error', 'own_invite');
  end if;

  select relationship_id into v_existing
  from public.relationship_members
  where user_id = v_uid;

  if v_existing is not null then
    if v_existing = v_inv.relationship_id then
      return jsonb_build_object('ok', true, 'already_member', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_in_relationship');
  end if;

  if v_inv.invited_email is not null then
    v_jwt_email := lower(nullif(trim(auth.jwt() ->> 'email'), ''));
    if v_jwt_email is null or v_jwt_email <> v_inv.invited_email then
      return jsonb_build_object('ok', false, 'error', 'email_mismatch');
    end if;
  end if;

  select count(*)::int into v_members
  from public.relationship_members m
  where m.relationship_id = v_inv.relationship_id;

  if v_members >= 2 then
    return jsonb_build_object('ok', false, 'error', 'relationship_full');
  end if;

  insert into public.relationship_members (user_id, relationship_id)
  values (v_uid, v_inv.relationship_id);

  update public.relationship_invites
  set consumed_at = now(), consumed_by = v_uid
  where id = v_inv.id;

  insert into public.profiles (id) values (v_inv.inviter_id)
  on conflict (id) do nothing;
  insert into public.profiles (id) values (v_uid)
  on conflict (id) do nothing;

  update public.profiles set partner_id = v_uid where id = v_inv.inviter_id;
  update public.profiles set partner_id = v_inv.inviter_id where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.desknote_join_invite(text) from public;
grant execute on function public.desknote_join_invite(text) to authenticated;
