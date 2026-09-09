-- DeskNote: the "messages-to-push" webhook, beside "messages-to-mqtt".
--
-- One INSERT into `messages` has to fan out twice: `mqtt-publish` lights up
-- the desk, `push-notify` taps the phone of whoever owns it. The dashboard
-- calls these Database Webhooks; underneath they are ordinary triggers on
-- `supabase_functions.http_request`.
--
-- The header carries WEBHOOK_SECRET, which lives in the Edge Function vault
-- and cannot be read back out of it. Rather than have an operator paste it a
-- second time — the header name and value are separate boxes in the
-- dashboard, and pasting both into one silently 401s every call — this reads
-- the value straight out of the MQTT trigger that already carries it. The
-- secret therefore never leaves the database.
--
-- On a fresh project with no MQTT webhook yet there is nothing to copy from,
-- so this reports that and does nothing; create both by hand from
-- docs/ios-push-notifications.md.

do $$
declare
  source_def text;
  secret text;
  function_url constant text :=
    'https://lareedskrwqleutgyskf.supabase.co/functions/v1/push-notify';
begin
  if to_regnamespace('supabase_functions') is null then
    raise notice
      'supabase_functions schema absent — no Database Webhooks on this project; skipping messages-to-push';
    return;
  end if;

  -- Any trigger on the table that already carries the shared secret will
  -- do; matching on the header rather than on a name keeps this working if
  -- the MQTT webhook was ever renamed.
  select pg_get_triggerdef(t.oid) into source_def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'messages'
    and not t.tgisinternal
    and t.tgname <> 'messages-to-push'
    and pg_get_triggerdef(t.oid) ilike '%x-webhook-secret%'
  limit 1;

  if source_def is null then
    raise notice
      'no existing webhook on public.messages carries an x-webhook-secret header; skipping messages-to-push';
    return;
  end if;

  secret := (regexp_match(source_def, '"x-webhook-secret"\s*:\s*"([^"]*)"', 'i'))[1];

  if secret is null or secret = '' then
    raise exception
      'found a webhook on public.messages but could not read its x-webhook-secret value';
  end if;

  execute 'drop trigger if exists "messages-to-push" on public.messages';
  execute format(
    'create trigger "messages-to-push" after insert on public.messages '
    || 'for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    function_url,
    'POST',
    jsonb_build_object(
      'Content-type', 'application/json',
      'x-webhook-secret', secret)::text,
    '{}',
    -- The function answers immediately and delivers in the background, so
    -- this timeout cannot cut a push off mid-flight.
    '5000');

  raise notice 'messages-to-push now posts to %', function_url;
end $$;
