"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseMessageHistoryFilter } from "@/lib/messages/history-filters";
import type { MessageHistoryFilter } from "@/types/messages";
import { cn } from "@/lib/utils";

const tabs: { key: MessageHistoryFilter; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Everything you can see" },
  { key: "sent", label: "Sent by me", hint: "Your outgoing lines" },
  { key: "desk", label: "To my desk", hint: "Aimed at your display" },
];

export function MessageHistoryFilters() {
  const searchParams = useSearchParams();
  const active = parseMessageHistoryFilter(searchParams.get("history") ?? undefined);

  return (
    <div
      className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible"
      role="tablist"
      aria-label="Filter message history"
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        const href =
          t.key === "all" ? "/dashboard" : `/dashboard?history=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            scroll={false}
            role="tab"
            aria-selected={isActive}
            title={t.hint}
            className={cn(
              "shrink-0 rounded-full px-4 py-2.5 text-center text-xs font-medium transition-colors",
              "min-h-11 min-w-[5.5rem] sm:min-w-0",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100/80",
              isActive
                ? "bg-plum-500 text-cream shadow-soft"
                : "bg-white/70 text-plum-400 ring-1 ring-plum-100/50 hover:bg-blush-50/80 hover:text-plum-500"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
