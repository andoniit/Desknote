-- Secret one-time notes: arrive hidden on the desk, tap to reveal, tap again
-- to destroy. New message_type value 'secret'.
alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
    check (message_type in ('standard', 'quick_send', 'system', 'secret'));
