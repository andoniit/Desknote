import type { NoteDeliveryStatus } from "@/types/messages";

export type SeenUiState = "seen" | "unseen" | "unknown";

/**
 * Maps note queue status to a simple seen / unseen chip for history.
 * `seen` → read on display; `delivered` / `queued` → still unseen from the reader’s perspective.
 */
export function deliveryToSeenState(
  status: NoteDeliveryStatus | null | undefined
): SeenUiState {
  if (!status) return "unknown";
  if (status === "seen") return "seen";
  return "unseen";
}

export function seenStateLabel(state: SeenUiState): string {
  if (state === "seen") return "Seen";
  if (state === "unseen") return "Unseen";
  return "Status n/a";
}
