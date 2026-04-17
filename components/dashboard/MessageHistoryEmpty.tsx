import { EmptyState } from "@/components/ui/EmptyState";
import type { MessageHistoryFilter } from "@/types/messages";

const copy: Record<
  MessageHistoryFilter,
  { title: string; body: string }
> = {
  all: {
    title: "A quiet inbox",
    body: "When you or your partner send something to a desk, the last twenty messages will gather here — soft, chronological, yours.",
  },
  sent: {
    title: "Nothing sent from you yet",
    body: "Your outgoing notes will appear here once you send from the composer above.",
  },
  desk: {
    title: "No one has messaged your desk",
    body: "When your partner sends to your display, you will see it here with read status.",
  },
};

export function MessageHistoryEmpty({ filter }: { filter: MessageHistoryFilter }) {
  const c = copy[filter];
  return (
    <EmptyState
      title={c.title}
      description={c.body}
      tone="warm"
      contentClassName="max-w-sm"
    />
  );
}
