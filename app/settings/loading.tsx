import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <AppShell>
      <div className="grid gap-5 sm:gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="card space-y-3 p-5 sm:p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="card space-y-3 p-5 sm:p-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-11 w-40" />
        </div>
      </div>
    </AppShell>
  );
}
