import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** 256-bit token as 64 hex chars — store only the hash on the server. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function verifyDeviceToken(plaintext: string, storedSha256Hex: string): boolean {
  try {
    const a = Buffer.from(hashDeviceToken(plaintext), "hex");
    const b = Buffer.from(storedSha256Hex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
