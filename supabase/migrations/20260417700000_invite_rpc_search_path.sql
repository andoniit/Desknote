-- Invite RPC used `set search_path = public` while `gen_random_bytes()` comes from pgcrypto
-- (on Supabase: `extensions` schema). That yields "function gen_random_bytes does not exist"
-- at runtime and the app shows a generic invite error.
alter function public.desknote_create_invite(text) set search_path to public, extensions;
alter function public.desknote_join_invite(text) set search_path to public, extensions;
