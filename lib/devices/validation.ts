const PAIRING_DIGITS = 6;
const NAME_MAX = 48;
const LOCATION_MAX = 64;

/** Strip non-digits; pairing codes are six digits (may include leading zeros). */
export function normalizePairingCodeInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function validatePairingCode(raw: string): string | null {
  const n = normalizePairingCodeInput(raw);
  if (n.length !== PAIRING_DIGITS) {
    return `Enter all ${PAIRING_DIGITS} digits from the display.`;
  }
  return null;
}

export function validateDeviceName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "Give this desk a short name — for example “Her desk”.";
  if (t.length > NAME_MAX) {
    return `Keep the name under ${NAME_MAX} characters.`;
  }
  return null;
}

export function validateLocationName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.length > LOCATION_MAX) {
    return `Location can be at most ${LOCATION_MAX} characters.`;
  }
  return null;
}

export function validateDeviceId(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return "Missing desk — refresh the page and try again.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) {
    return "That desk id does not look valid.";
  }
  return null;
}
