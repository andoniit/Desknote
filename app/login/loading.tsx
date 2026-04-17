import { Skeleton } from "@/components/ui/Skeleton";

export default function LoginLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 pb-16 pt-10">
      <Skeleton className="mb-10 h-9 w-36 rounded-full" />
      <div className="w-full max-w-[min(100%,24rem)] space-y-4">
        <Skeleton className="h-48 w-full shadow-card" />
        <Skeleton className="mx-auto h-3 w-48" />
      </div>
    </div>
  );
}
