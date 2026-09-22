-- DeskNote: accent colours to match the Lavender, Sky and Peach desk themes.
--
-- The desk tints its heart, stickers and progress bar with the accent chosen
-- in Settings. The five original accents were picked for the original four
-- themes; these three let the new ones be matched. Themes themselves need no
-- migration — devices.theme has no CHECK.
--
-- Keep in step with lib/devices/accents.ts, DeskAccent in the iOS app and
-- kAccents in firmware/desknote_main/desknote_main.ino.

alter table public.devices
  drop constraint if exists devices_accent_color_check;

alter table public.devices
  add constraint devices_accent_color_check
    check (accent_color in ('rose', 'blush', 'plum', 'sage', 'cream', 'lavender', 'sky', 'peach'));
