import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: ReactNode;
  className?: string;
};

/** Serif subsection title + optional muted copy (e.g. relationship forms). */
export function SectionTitle({ title, description, className }: Props) {
  return (
    <div className={cn("space-y-1", className)}>
      <h2 className="font-serif text-xl text-plum-500 sm:text-[1.35rem]">{title}</h2>
      {description ? <p className="text-sm leading-relaxed text-plum-300">{description}</p> : null}
    </div>
  );
}
