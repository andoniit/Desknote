"use client";

import { Suspense } from "react";
import { MessageHistoryFilters } from "@/components/dashboard/MessageHistoryFilters";

export function MessageHistoryFilterShell() {
  return (
    <Suspense
      fallback={
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-11 min-w-[5.5rem] animate-pulse rounded-full bg-plum-50/80"
            />
          ))}
        </div>
      }
    >
      <MessageHistoryFilters />
    </Suspense>
  );
}
