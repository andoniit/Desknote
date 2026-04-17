const PIN_LEN = 6;

/** Digits only, exactly six (for Supabase password field). */
export function normalizePinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PIN_LEN);
}

/** `null` if valid; otherwise a short user-facing error string. */
export function validateSixDigitPin(digits: string): string | null {
  if (digits.length !== PIN_LEN) {
    return `Use exactly ${PIN_LEN} numbers for your PIN.`;
  }
  return null;
}
