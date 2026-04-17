import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const baseFocus =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100/80";

const variants = {
  primary:
    "inline-flex h-11 min-h-[2.75rem] items-center justify-center rounded-2xl bg-plum-400 px-5 text-sm font-medium text-cream shadow-soft transition-colors duration-200 hover:bg-plum-500 active:scale-[0.99]",
  secondary:
    "inline-flex h-11 min-h-[2.75rem] items-center justify-center rounded-2xl border border-ash-200/90 bg-white/85 px-5 text-sm font-medium text-plum-500 shadow-sm transition-all duration-200 hover:border-rose-200/80 hover:bg-white active:scale-[0.99]",
  ghost:
    "inline-flex items-center justify-center rounded-xl px-2 py-1 text-sm font-medium text-plum-400 underline decoration-rose-200/70 underline-offset-[0.2em] transition-colors hover:text-rose-400",
  inline:
    "font-medium text-plum-500 underline decoration-rose-200/80 underline-offset-[0.2em] transition-colors hover:text-rose-400",
} as const;

type Variant = keyof typeof variants;

type Props = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  className?: string;
};

/** Consistent navigation / form links (filled, outline, or text). */
export function AppLink({ variant = "secondary", className, ...props }: Props) {
  return (
    <Link className={cn(baseFocus, variants[variant], className)} {...props} />
  );
}
