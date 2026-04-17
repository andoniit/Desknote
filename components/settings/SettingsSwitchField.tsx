"use client";

import { Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  name: string;
  defaultChecked: boolean;
  title: string;
  description: string;
  disabled?: boolean;
};

export function SettingsSwitchField({
  id,
  name,
  defaultChecked,
  title,
  description,
  disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ash-200/50 bg-white/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-plum-500">
          {title}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-plum-300">{description}</p>
      </div>
      <label
        className={cn(
          "relative inline-flex h-9 w-[3.25rem] shrink-0 cursor-pointer items-center rounded-full border border-ash-200/80 bg-ash-50/80 p-0.5 transition",
          "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-rose-100/80",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          value="on"
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="peer sr-only"
        />
        <span
          className={cn(
            "pointer-events-none block h-7 w-7 rounded-full bg-white shadow-sm ring-1 ring-plum-100/30 transition-transform",
            "translate-x-0 peer-checked:translate-x-[1.35rem] peer-checked:bg-plum-400 peer-checked:ring-plum-300/40"
          )}
          aria-hidden
        />
      </label>
    </div>
  );
}
