import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MessageHistoryFilter } from "@/types/messages";

type Props = {
  page: number;
  pageCount: number;
  totalCount: number;
  perPage: number;
  historyFilter: MessageHistoryFilter;
};

function dashboardHref(targetPage: number, historyFilter: MessageHistoryFilter) {
  const p = new URLSearchParams();
  if (historyFilter !== "all") p.set("history", historyFilter);
  if (targetPage > 1) p.set("page", String(targetPage));
  const q = p.toString();
  return q ? `/dashboard?${q}` : "/dashboard";
}

export function MessageHistoryPagination({
  page,
  pageCount,
  totalCount,
  perPage,
  historyFilter,
}: Props) {
  if (pageCount <= 1 || totalCount === 0) {
    return null;
  }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);
  const prevHref = dashboardHref(page - 1, historyFilter);
  const nextHref = dashboardHref(page + 1, historyFilter);

  return (
    <nav
      className="flex flex-col items-stretch justify-between gap-3 border-t border-plum-100/40 pt-4 sm:flex-row sm:items-center"
      aria-label="Message history pages"
    >
      <p className="text-center text-xs text-plum-300 sm:text-left">
        Showing <span className="font-medium text-plum-400">{from}</span>
        <span className="text-plum-200">–</span>
        <span className="font-medium text-plum-400">{to}</span>
        <span className="text-plum-200"> of </span>
        <span className="font-medium text-plum-400">{totalCount}</span>
        <span className="ml-1.5 text-plum-200">· Page {page} of {pageCount}</span>
      </p>
      <div className="flex items-center justify-center gap-2 sm:justify-end">
        {page > 1 ? (
          <Link
            href={prevHref}
            scroll={false}
            className={cn(
              "min-h-11 min-w-[5.5rem] rounded-full bg-white/80 px-4 py-2.5 text-center text-xs font-medium",
              "text-plum-500 ring-1 ring-plum-100/50 transition-colors hover:bg-blush-50/80"
            )}
          >
            Previous
          </Link>
        ) : (
          <span
            className="min-h-11 min-w-[5.5rem] rounded-full px-4 py-2.5 text-center text-xs font-medium text-plum-200"
            aria-disabled
          >
            Previous
          </span>
        )}
        {page < pageCount ? (
          <Link
            href={nextHref}
            scroll={false}
            className={cn(
              "min-h-11 min-w-[5.5rem] rounded-full bg-white/80 px-4 py-2.5 text-center text-xs font-medium",
              "text-plum-500 ring-1 ring-plum-100/50 transition-colors hover:bg-blush-50/80"
            )}
          >
            Next
          </Link>
        ) : (
          <span
            className="min-h-11 min-w-[5.5rem] rounded-full px-4 py-2.5 text-center text-xs font-medium text-plum-200"
            aria-disabled
          >
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
