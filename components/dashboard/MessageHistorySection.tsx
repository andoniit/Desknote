import { MessageHistoryCard } from "@/components/dashboard/MessageHistoryCard";
import { MessageHistoryEmpty } from "@/components/dashboard/MessageHistoryEmpty";
import { MessageHistoryFilterShell } from "@/components/dashboard/MessageHistoryFilterShell";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { MessageHistoryEntry, MessageHistoryFilter } from "@/types/messages";

type Props = {
  filter: MessageHistoryFilter;
  entries: MessageHistoryEntry[];
};

export function MessageHistorySection({ filter, entries }: Props) {
  return (
    <section aria-labelledby="message-history-heading" className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionLabel id="message-history-heading">Recent history</SectionLabel>
        <MessageHistoryFilterShell />
      </div>

      {entries.length === 0 ? (
        <MessageHistoryEmpty filter={filter} />
      ) : (
        <ul className="grid list-none gap-3 p-0 sm:gap-4">
          {entries.map((entry) => (
            <li key={entry.id}>
              <MessageHistoryCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
