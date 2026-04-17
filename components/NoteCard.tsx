import { Card } from "@/components/ui/Card";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Note = {
  id: string;
  body: string;
  created_at: string;
  status: "queued" | "delivered" | "seen";
  direction: "incoming" | "outgoing";
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
      <div className="flex items-center justify-between text-xs text-plum-300">
        <span>
          {note.direction === "outgoing" ? "You wrote" : "They wrote"} ·{" "}
          {formatRelativeTime(note.created_at)}
        </span>
        <span className="chip">{statusLabel}</span>
      </div>
    </Card>
  );
}
