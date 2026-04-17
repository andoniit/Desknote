const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id);
}

/** Alias for device id checks (same UUID format as notes, users, etc.). */
export const isValidDeviceUuid = isValidUuid;
