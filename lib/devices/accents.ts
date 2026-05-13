export const DEVICE_ACCENTS = [
  { id: "rose", label: "Rose", swatch: "bg-rose-400" },
  { id: "blush", label: "Blush", swatch: "bg-blush-400" },
  { id: "plum", label: "Plum", swatch: "bg-plum-400" },
  { id: "sage", label: "Sage", swatch: "bg-[#8FA894]" },
  { id: "cream", label: "Cream", swatch: "bg-cream-300" },
] as const;

export type DeviceAccentId = (typeof DEVICE_ACCENTS)[number]["id"];

export function isDeviceAccentId(v: string): v is DeviceAccentId {
  return DEVICE_ACCENTS.some((a) => a.id === v);
}

export function accentLabel(id: string | null | undefined): string {
  if (!id) return "—";
  const a = DEVICE_ACCENTS.find((x) => x.id === id);
  return a?.label ?? id;
}
