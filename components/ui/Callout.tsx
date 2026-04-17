import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

/** Gentle inset panel for tips and secondary context (e.g. link your pair). */
export function Callout({ children, className }: Props) {
  return (
    <aside
      className={cn(
        "rounded-2xl border border-rose-100/70 bg-white/65 px-4 py-3.5 text-sm leading-relaxed text-plum-400 shadow-card backdrop-blur-xl",
        "animate-fade-in sm:px-5 sm:py-4",
        className
      )}
    >
      {children}
    </aside>
  );
}
