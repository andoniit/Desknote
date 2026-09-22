/**
 * Desk themes. The desk paints the whole screen in `paper` and sets notes in
 * `ink`; the swatch in Settings shows exactly that pair. Keep the ids and
 * colours in step with kThemes in firmware/desknote_main/desknote_main.ino and
 * DeskTheme in the iOS app.
 */
export const DEVICE_THEMES = [
  {
    id: "cream",
    label: "Cream",
    hint: "Warm paper and plum ink — the app's own look.",
    paper: "#FDFAF6",
    ink: "#4E353D",
  },
  { id: "blush", label: "Blush", hint: "Rose-tinted paper, deep berry ink.", paper: "#FBE8E4", ink: "#5A2E36" },
  { id: "sage", label: "Sage", hint: "Quiet green paper, forest ink.", paper: "#EEF2EA", ink: "#2F3B30" },
  { id: "lavender", label: "Lavender", hint: "Soft lilac paper, deep violet ink.", paper: "#EEEAF6", ink: "#3C3452" },
  { id: "sky", label: "Sky", hint: "Pale blue paper, navy ink.", paper: "#E8F0F6", ink: "#22384A" },
  { id: "peach", label: "Peach", hint: "Warm apricot paper, brown ink.", paper: "#FCEBDD", ink: "#5A3522" },
  { id: "plum", label: "Plum", hint: "Dark plum with blush text — easy on the eyes.", paper: "#2A1C22", ink: "#F4E6EA" },
  { id: "midnight", label: "Midnight", hint: "Dark navy for a bedside desk at night.", paper: "#141A2A", ink: "#E8ECF5" },
] as const;

export type DeviceThemeId = (typeof DEVICE_THEMES)[number]["id"];

export function isDeviceThemeId(v: string): v is DeviceThemeId {
  return DEVICE_THEMES.some((t) => t.id === v);
}

export function themeLabel(id: string | null | undefined): string {
  if (!id) return "—";
  const t = DEVICE_THEMES.find((x) => x.id === id);
  return t?.label ?? id;
}
