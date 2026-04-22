import { Card } from "@/components/ui/Card";
import type { MessageHistoryEntry } from "@/types/messages";
import { deliveryToSeenState, seenStateLabel } from "@/lib/messages/delivery-status";
import {
  formatMessageDetailLine,
  formatMessageRelative,
  formatMessageTitleAttr,
} from "@/lib/messages/format-time";
import { cn } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  standard: "Note",
  quick_send: "Quick",
  system: "System",
};

type Props = {
  entry: MessageHistoryEntry;
};

export function MessageHistoryCard({ entry }: Props) {
  const seenState = deliveryToSeenState(entry.note_status);
  const seenLabel = seenStateLabel(seenState);

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 border-white/70 p-4 sm:p-5",
        "shadow-card transition-shadow duration-300 hover:shadow-soft"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-plum-200">
            <span className="text-plum-400">{entry.sender_label}</span>
            <span className="mx-1.5 text-plum-100">→</span>
            <span className="text-plum-500">{entry.device_name}</span>
          </p>
          <p className="font-mdi-fallback font-serif text-lg leading-snug text-plum-500 sm:text-xl">
            {entry.content}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {entry.is_pinned ? (
            <span className="chip bg-rose-50 text-rose-400">Pinned</span>
          ) : null}
          <span className="chip">{typeLabel[entry.message_type] ?? entry.message_type}</span>
          <span
            className={cn(
              "chip",
              seenState === "seen" && "bg-blush-50 text-plum-400",
              seenState === "unseen" && "bg-white/90 text-rose-400 ring-1 ring-rose-100/80",
              seenState === "unknown" && "bg-ash-50 text-plum-200"
            )}
          >
            {seenLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-plum-100/30 pt-3 text-xs text-plum-300">
        <time
          dateTime={entry.created_at}
          title={formatMessageTitleAttr(entry.created_at)}
          className="tabular-nums"
        >
          <span className="font-medium text-plum-400">{formatMessageRelative(entry.created_at)}</span>
          <span className="mx-1.5 text-plum-200">·</span>
          <span className="text-plum-300">{formatMessageDetailLine(entry.created_at)}</span>
        </time>
      </div>
    </Card>
  );
}
