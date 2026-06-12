"use client";

import { useMemo, useState } from "react";
import { SUPPORTED_EMOJI } from "@/lib/emoji/supported.gen";
import { cn } from "@/lib/utils";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (nextValue: string) => void;
  maxLength: number;
  valueLength: number;
  disabled?: boolean;
};

/** Display order + labels for the category ids emitted by the generator. */
const CATEGORIES: { id: string; label: string }[] = [
  { id: "love", label: "Love" },
  { id: "spicy", label: "Spicy" },
  { id: "faces", label: "Faces" },
  { id: "animals", label: "Animals" },
  { id: "nature", label: "Nature" },
  { id: "food", label: "Food" },
  { id: "fun", label: "Fun" },
  { id: "everyday", label: "Everyday" },
];

/**
 * Stickers grouped by category: tap a chip to switch, stickers lay out in a
 * wrapped grid below — no sideways hunting through one long row.
 */
export function EmojiPickerPanel({
  textareaRef,
  onInsert,
  maxLength,
  valueLength,
  disabled,
}: Props) {
  const byCategory = useMemo(() => {
    const seen = new Set<string>();
    const map = new Map<string, typeof SUPPORTED_EMOJI>();
    for (const e of SUPPORTED_EMOJI) {
      if (seen.has(e.char)) continue;
      seen.add(e.char);
      const id = CATEGORIES.some((c) => c.id === e.category)
        ? e.category
        : "fun";
      const list = map.get(id) ?? [];
      list.push(e);
      map.set(id, list);
    }
    return map;
  }, []);

  const tabs = useMemo(
    () => CATEGORIES.filter((c) => (byCategory.get(c.id)?.length ?? 0) > 0),
    [byCategory]
  );
  const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id ?? "love");
  const active = byCategory.get(activeId) ?? [];

  function insert(ch: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = (el.value.slice(0, start) + ch + el.value.slice(end)).slice(
      0,
      maxLength
    );
    onInsert(next);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const caret = Math.min(start + ch.length, maxLength);
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="mt-1.5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-plum-200">
          Desk stickers
        </p>
        <span className="shrink-0 text-xs tabular-nums text-plum-200">
          {valueLength}/{maxLength}
        </span>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-rose-100/90 bg-rose-50/45 shadow-inner",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {/* Category chips — horizontally scrollable on narrow screens. */}
        <div
          role="tablist"
          aria-label="Sticker categories"
          className={cn(
            "scrollbar-none flex flex-nowrap gap-1 overflow-x-auto border-b border-rose-100/80 bg-rose-50/80 px-2 py-1.5",
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {tabs.map((c) => {
            const selected = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(c.id)}
                disabled={disabled}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium tracking-wide transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200",
                  selected
                    ? "bg-rose-400/90 text-white shadow-sm"
                    : "bg-white/70 text-plum-300 hover:bg-white hover:text-plum-500"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Wrapped grid for the active category — everything visible at once. */}
        <div
          role="tabpanel"
          aria-label={`${tabs.find((c) => c.id === activeId)?.label ?? ""} stickers`}
          className="flex flex-wrap gap-1.5 px-2 py-2"
        >
          {active.map((e) => {
            const label = e.name ?? e.cp;
            return (
              <button
                key={e.cp}
                type="button"
                title={`${label} (${e.cp})${e.animated ? " — animates on the desk" : ""}`}
                onClick={() => insert(e.char)}
                disabled={disabled}
                className={cn(
                  "relative flex h-[3.25rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-rose-100/70 bg-white/70 px-0.5 py-1",
                  "transition-all hover:border-rose-200/80 hover:bg-white hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200",
                  e.mdi && "font-mdi"
                )}
              >
                {e.animated ? (
                  <span
                    aria-hidden="true"
                    title="Animates on the desk"
                    className="absolute right-1 top-0.5 text-[8px] leading-none text-rose-300"
                  >
                    ✦
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className="text-xl leading-none text-plum-500"
                >
                  {e.char}
                </span>
                <span className="max-w-full truncate text-[8px] font-medium uppercase tracking-wider text-plum-300">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
