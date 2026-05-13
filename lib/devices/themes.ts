export const DEVICE_THEMES = [
  {
    id: "cream",
    label: "Cream & plum",
    hint: "Header, menus, and paired screens — soft default like the app.",
  },
  { id: "blush", label: "Blush", hint: "Warm rose frame and menu tones." },
  { id: "plum", label: "Plum", hint: "Deeper frame and menu background." },
  { id: "sage", label: "Sage", hint: "Quiet green frame and menu tones." },
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
