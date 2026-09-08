-- DeskNote: APNs device tokens for the iOS app.
--
-- The desk displays learn about a new note over MQTT (see the
-- `mqtt-publish` function); the phone in the other person's pocket has no
-- such channel while the app is closed. This table is what the
-- `push-notify` function reads to reach it: one row per installed app,
-- keyed by the APNs token, owned by whoever is signed in on that phone.
--
-- Nothing about a message is stored here. The push only ever says that a
-- note is waiting — the words stay in `notes` / `messages`, behind RLS.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- APNs hands back a 32-byte token; it is the natural key, and a phone
  -- that signs in as the other partner must move its row, not add one.
  token text not null unique,
  platform text not null default 'ios'
    constraint push_tokens_platform_check check (platform in ('ios')),
  bundle_id text,
  -- A debug build's token only exists on APNs sandbox, a TestFlight or
  -- App Store build's only on production. Sending to the wrong host comes
  -- back as BadDeviceToken, which looks exactly like a dead token and
  -- would get the row deleted — so each row remembers its host.
  environment text not null default 'production'
    constraint push_tokens_environment_check check (environment in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Read and forget your own rows. There is deliberately no insert or update
-- policy: registering goes through `register_push_token` below, so no
-- client can point somebody else's token at its own account.
--
-- The Edge Function reads with the service role key, which bypasses RLS —
-- it needs the *recipient's* tokens, and the recipient is by definition
-- not the caller.
drop policy if exists "push_tokens select own" on public.push_tokens;
create policy "push_tokens select own"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "push_tokens delete own" on public.push_tokens;
create policy "push_tokens delete own"
  on public.push_tokens for delete
  using (user_id = auth.uid());

-- Claims a token for the caller. `security definer` because the upsert has
-- to be able to overwrite a row the caller does not own yet: one phone,
-- two partners taking turns signing in, one APNs token between them.
create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'ios',
  p_environment text default 'production',
  p_bundle_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'token required';
  end if;

  insert into public.push_tokens (user_id, token, platform, environment, bundle_id)
  values (
    auth.uid(),
    btrim(p_token),
    coalesce(nullif(btrim(p_platform), ''), 'ios'),
    coalesce(nullif(btrim(p_environment), ''), 'production'),
    nullif(btrim(p_bundle_id), ''))
  on conflict (token) do update
    set user_id = auth.uid(),
        platform = excluded.platform,
        environment = excluded.environment,
        bundle_id = excluded.bundle_id,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text, text) from public;
grant execute on function public.register_push_token(text, text, text, text) to authenticated;
