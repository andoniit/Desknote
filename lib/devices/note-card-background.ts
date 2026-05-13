export const DEVICE_NOTE_CARD_BACKGROUNDS = [
  {
    id: "match_theme",
    label: "Match desk style",
    hint: "Card picks up the colors for Cream, Blush, Plum, or Sage above.",
  },
  {
    id: "light",
    label: "Light paper",
    hint: "Always warm light card with dark type — easiest to read in daylight.",
  },
  {
    id: "dark",
    label: "Dark card",
    hint: "Dark panel with light text — good in dim rooms.",
  },
] as const;

export type DeviceNoteCardBackgroundId =
  (typeof DEVICE_NOTE_CARD_BACKGROUNDS)[number]["id"];

export function isDeviceNoteCardBackgroundId(v: string): v is DeviceNoteCardBackgroundId {
  return DEVICE_NOTE_CARD_BACKGROUNDS.some((x) => x.id === v);
}

export function noteCardBackgroundLabel(id: string | null | undefined): string {
  if (!id) return "—";
  const row = DEVICE_NOTE_CARD_BACKGROUNDS.find((x) => x.id === id);
  return row?.label ?? id;
}
