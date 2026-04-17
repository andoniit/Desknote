import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

/** Consistent page title stack (eyebrow + serif headline + muted body). */
export function PageHeader({ eyebrow, title, description, className }: Props) {
  return (
    <header className={cn("mb-8 sm:mb-10", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-plum-200">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-serif text-[1.65rem] leading-[1.15] tracking-tight text-plum-500 sm:text-3xl md:text-[2.125rem]">
        {title}
      </h1>
      {description ? (
        <div className="mt-3 max-w-xl text-sm leading-relaxed text-plum-300 sm:text-[0.9375rem]">
          {description}
        </div>
      ) : null}
    </header>
  );
}
