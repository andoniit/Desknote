import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
};

const sizes = {
  sm: { mark: "h-7 w-7", text: "text-lg" },
  md: { mark: "h-9 w-9", text: "text-xl" },
  lg: { mark: "h-10 w-10", text: "text-[1.35rem]" },
} as const;

/** Brand gradient orb + optional wordmark (login, marketing, errors). */
export function LogoMark({
  href = "/",
  size = "md",
  showWordmark = true,
  className,
}: Props) {
  const s = sizes[size];
  const inner = (
    <>
      <span
        className={cn(
          "shrink-0 rounded-full bg-gradient-to-br from-rose-300 to-plum-300 shadow-soft",
          s.mark
        )}
        aria-hidden
      />
      {showWordmark ? (
        <span className={cn("font-serif tracking-tight text-plum-500", s.text)}>
          DeskNote
        </span>
      ) : null}
    </>
  );

  const wrapClass = cn(
    "inline-flex items-center gap-2 rounded-full py-1 transition-opacity duration-200 hover:opacity-90",
    className
  );

  return (
    <Link href={href} className={wrapClass}>
      {inner}
    </Link>
  );
}
