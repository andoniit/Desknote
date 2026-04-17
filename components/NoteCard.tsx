import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Note = {
  id: string;
  body: string;
  created_at: string;
  status: "queued" | "delivered" | "seen";
  direction: "incoming" | "outgoing";
  /** When you sent the note, which desk it was aimed at */
  audienceLabel?: string | null;
};

export function NoteCard({ note }: { note: Note }) {
  const statusLabel = {
    queued: "on the way",
    delivered: "on their desk",
    seen: "read",
  }[note.status];

  return (
    <Card
      className={cn(
        "flex flex-col gap-3",
        note.direction === "outgoing"
          ? "bg-blush-50/80"
          : "bg-white/80"
      )}
    >
      <p className="font-serif text-xl leading-snug text-plum-500">
        {note.body}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-plum-300">
        <span>
          {note.direction === "outgoing" ? "You wrote" : "They wrote"}
          {note.direction === "outgoing" && note.audienceLabel ? (
            <span className="text-plum-200"> · {note.audienceLabel}</span>
          ) : null}
          <span className="text-plum-200"> · </span>
          {formatRelativeTime(note.created_at)}
        </span>
        <span className="chip">{statusLabel}</span>
      </div>
    </Card>
  );
}
