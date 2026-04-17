import type { DeskMessageType } from "@/types/messages";

export const DESK_MESSAGE_MAX_LENGTH = 140;

export function validateDeskMessageContent(raw: string): {
  ok: true;
  value: string;
} | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Write something before sending." };
  }
  if (trimmed.length > DESK_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep it under ${DESK_MESSAGE_MAX_LENGTH} characters — little notes stay little.`,
    };
  }
  return { ok: true, value: trimmed };
}

export function isDeskMessageType(v: string): v is DeskMessageType {
  return v === "standard" || v === "quick_send" || v === "system";
}
