export const DEVICE_ACCENTS = [
  { id: "rose", label: "Rose", swatch: "bg-rose-400" },
  { id: "blush", label: "Blush", swatch: "bg-blush-400" },
  { id: "plum", label: "Plum", swatch: "bg-plum-400" },
  { id: "sage", label: "Sage", swatch: "bg-[#8FA894]" },
  { id: "cream", label: "Cream", swatch: "bg-cream-300" },
  // Added with the Lavender, Sky and Peach desk themes so each can be matched.
  // Keep in step with the devices_accent_color_check constraint, kAccents in
  // the firmware, and DeskAccent in the iOS app.
  { id: "lavender", label: "Lavender", swatch: "bg-[#8B7BB8]" },
  { id: "sky", label: "Sky", swatch: "bg-[#5E8DB3]" },
  { id: "peach", label: "Peach", swatch: "bg-[#D9895B]" },
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
