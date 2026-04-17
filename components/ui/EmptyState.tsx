import type { ReactNode } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { AppLink } from "@/components/ui/AppLink";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: ReactNode;
  /** Primary outline CTA */
  action?: { href: string; label: string };
  /** Extra footer (e.g. inline code) */
  children?: ReactNode;
  className?: string;
  /** Slightly warmer panel (e.g. message history). */
  tone?: "plain" | "warm";
  /** Inner width constraint (default centered narrow column). */
  contentClassName?: string;
  actionAlign?: "center" | "start";
};

/** Dashed, low-emphasis empty pattern — matches “no data yet” across the app. */
export function EmptyState({
  title,
  description,
  action,
  children,
  className,
  tone = "plain",
  contentClassName,
  actionAlign = "center",
}: Props) {
  return (
    <Card
      className={cn(
        "border-dashed border-rose-100/70 text-center shadow-none sm:p-8",
        tone === "warm"
          ? "border-rose-100/55 bg-gradient-to-br from-white/75 to-blush-50/30"
          : "bg-white/55",
        className
      )}
    >
      <div className={cn("mx-auto max-w-md", contentClassName)}>
        <CardTitle className="font-serif text-lg text-plum-500 sm:text-xl">{title}</CardTitle>
        <CardDescription className="mt-3 text-sm leading-relaxed text-plum-300">
          {description}
        </CardDescription>
        {children ? <div className="mt-4 text-left text-sm text-plum-300">{children}</div> : null}
        {action ? (
          <div
            className={cn(
              "mt-6 flex",
              actionAlign === "start" ? "justify-start" : "justify-center"
            )}
          >
            <AppLink href={action.href} variant="secondary">
              {action.label}
            </AppLink>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
