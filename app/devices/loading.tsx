import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

export default function DevicesLoading() {
  return (
    <AppShell>
      <div className="space-y-8 sm:space-y-10">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-[90%] max-w-md" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="card max-w-xl space-y-4 p-5 sm:p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
