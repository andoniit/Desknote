import type { MessageHistoryFilter } from "@/types/messages";
import { MESSAGE_HISTORY_FILTERS } from "@/types/messages";

export function parseMessageHistoryFilter(
  raw: string | string[] | undefined
): MessageHistoryFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "sent" || v === "desk") return v;
  return "all";
}

export function isMessageHistoryFilter(v: string): v is MessageHistoryFilter {
  return (MESSAGE_HISTORY_FILTERS as readonly string[]).includes(v);
}
