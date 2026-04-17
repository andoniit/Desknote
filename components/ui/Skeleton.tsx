import { cn } from "@/lib/utils";

type BlockProps = {
  className?: string;
};

/** Soft pulse block — compose into loading layouts. */
export function Skeleton({ className }: BlockProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-r from-plum-50 via-plum-100/60 to-plum-50",
        "bg-[length:220%_100%] animate-shimmer",
        className
      )}
    />
  );
}
