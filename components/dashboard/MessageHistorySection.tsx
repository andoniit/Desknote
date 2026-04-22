import { MessageHistoryCard } from "@/components/dashboard/MessageHistoryCard";
import { MessageHistoryEmpty } from "@/components/dashboard/MessageHistoryEmpty";
import { MessageHistoryFilterShell } from "@/components/dashboard/MessageHistoryFilterShell";
import { MessageHistoryPagination } from "@/components/dashboard/MessageHistoryPagination";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { MESSAGE_HISTORY_PAGE_SIZE } from "@/lib/messages/history-filters";
import type { MessageHistoryEntry, MessageHistoryFilter } from "@/types/messages";

type Props = {
  filter: MessageHistoryFilter;
  entries: MessageHistoryEntry[];
  page: number;
  pageCount: number;
  totalCount: number;
  perPage?: number;
};

export function MessageHistorySection({
  filter,
  entries,
  page,
  pageCount,
  totalCount,
  perPage = MESSAGE_HISTORY_PAGE_SIZE,
}: Props) {
  return (
    <section aria-labelledby="message-history-heading" className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionLabel id="message-history-heading">Recent history</SectionLabel>
        <MessageHistoryFilterShell />
      </div>

      {entries.length === 0 ? (
        <MessageHistoryEmpty filter={filter} />
      ) : (
        <>
          <ul className="grid list-none gap-3 p-0 sm:gap-4">
            {entries.map((entry) => (
              <li key={entry.id}>
                <MessageHistoryCard entry={entry} />
              </li>
            ))}
          </ul>
          <MessageHistoryPagination
            page={page}
            pageCount={pageCount}
            totalCount={totalCount}
            perPage={perPage}
            historyFilter={filter}
          />
        </>
      )}
    </section>
  );
}
