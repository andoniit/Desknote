import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  as?: "h2" | "h3" | "p";
  id?: string;
  children: ReactNode;
  className?: string;
};

/** Small uppercase section heading — use inside cards or between groups. */
export function SectionLabel({ as: Comp = "h2", id, children, className }: Props) {
  return (
    <Comp
      id={id}
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.2em] text-plum-200",
        className
      )}
    >
      {children}
    </Comp>
  );
}
