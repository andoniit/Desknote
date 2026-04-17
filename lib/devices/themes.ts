export const DEVICE_THEMES = [
  { id: "cream", label: "Cream & plum", hint: "Soft default, like the app" },
  { id: "blush", label: "Blush", hint: "Warm rose highlights" },
  { id: "plum", label: "Plum", hint: "Deeper accent" },
  { id: "sage", label: "Sage", hint: "Quiet green calm" },
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
