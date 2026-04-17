import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-plum-400 text-cream hover:bg-plum-500 shadow-soft disabled:opacity-50",
  secondary:
    "bg-white/80 text-plum-500 border border-ash-200 hover:bg-white hover:border-rose-200",
  ghost: "bg-transparent text-plum-400 hover:bg-blush-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-5 text-sm rounded-2xl",
  lg: "h-12 px-6 text-base rounded-2xl",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium",
          "transition-colors duration-200 focus:outline-none",
          "focus-visible:ring-4 focus-visible:ring-rose-100/80",
          "disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
