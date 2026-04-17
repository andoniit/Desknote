import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-7 sm:space-y-9">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-[88%] max-w-xs" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      <div className="card overflow-hidden p-0 shadow-card">
        <div className="border-b border-plum-100/30 px-4 py-4 sm:px-5">
          <Skeleton className="h-5 w-36 sm:w-44" />
          <Skeleton className="mt-2 h-3 w-full max-w-xs" />
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <Skeleton className="h-28 w-full" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-hidden pb-0.5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 min-w-[6.5rem] shrink-0 rounded-full" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
