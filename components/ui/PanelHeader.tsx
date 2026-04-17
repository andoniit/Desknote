import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
};

/** Top band inside elevated cards (composer, quick send, device settings). */
export function PanelHeader({ title, subtitle, className }: Props) {
  return (
    <div
      className={cn(
        "border-b border-plum-100/35 bg-gradient-to-br from-blush-50/55 via-white/30 to-white/50 px-4 py-4 sm:px-5 sm:py-[1.125rem]",
        className
      )}
    >
      <p className="font-serif text-lg leading-snug text-plum-500 sm:text-[1.125rem]">{title}</p>
      {subtitle ? (
        <p className="mt-1 text-xs leading-relaxed text-plum-300 sm:text-[0.8125rem]">{subtitle}</p>
      ) : null}
    </div>
  );
}
