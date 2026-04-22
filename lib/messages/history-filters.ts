import type { MessageHistoryFilter } from "@/types/messages";
import { MESSAGE_HISTORY_FILTERS } from "@/types/messages";

/** Messages per page in dashboard “Recent history”. */
export const MESSAGE_HISTORY_PAGE_SIZE = 10;

export function parseMessageHistoryFilter(
  raw: string | string[] | undefined
): MessageHistoryFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "sent" || v === "desk") return v;
  return "all";
}

/** 1-based page from `?page=`; defaults to 1, ignores invalid / negative values. */
export function parseMessageHistoryPage(
  raw: string | string[] | undefined
): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || v === "") return 1;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

export function isMessageHistoryFilter(v: string): v is MessageHistoryFilter {
  return (MESSAGE_HISTORY_FILTERS as readonly string[]).includes(v);
}
