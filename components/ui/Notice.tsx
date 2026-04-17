import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  success:
    "border-rose-100/90 bg-rose-50/70 text-plum-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
  danger: "border-rose-200/70 bg-white/90 text-rose-500",
  info: "border-plum-100/80 bg-white/75 text-plum-400",
} as const;

type Tone = keyof typeof tones;

type Props = {
  tone: Tone;
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
};

/** Inline success, error, or neutral notices (forms, login). */
export function Notice({ tone, children, className, role }: Props) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm leading-relaxed animate-fade-in",
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
