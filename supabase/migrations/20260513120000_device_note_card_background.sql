-- DeskNote: explicit message-card background on the ESP32 (separate from desk "theme" chrome).

alter table public.devices
  add column if not exists note_card_background text not null default 'match_theme'
    constraint devices_note_card_background_check
      check (note_card_background in ('light', 'dark', 'match_theme'));

comment on column public.devices.note_card_background is
  'Message card on desk display: light (warm paper), dark (light text), or match_theme (use desk theme colors).';
