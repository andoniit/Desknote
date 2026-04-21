"use client";

import { useMemo } from "react";
import { SUPPORTED_EMOJI } from "@/lib/emoji/supported.gen";
import { cn } from "@/lib/utils";

type Props = {
  /** When the user picks an emoji, insert it into the textarea at the current
   *  caret position (or append if no caret). Parent passes the textarea ref
   *  so selectionStart/End works against the live DOM node. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Called with the new textarea value after insertion. Parent syncs its
   *  controlled state from this. */
  onInsert: (nextValue: string) => void;
  /** Upper bound on the note length. Insertion is a no-op once reached. */
  maxLength: number;
  disabled?: boolean;
};

/**
 * Inline sticker grid rendered directly under the composer textarea — a
 * wrapping multi-row layout (no popover, no hidden scroll) so every glyph is
 * visible at a glance. If the set ever outgrows two rows the container caps
 * its height and exposes a native scrollbar so users always have an obvious
 * affordance for "there's more below". All glyphs come from the MDI webfont
 * (`var(--font-mdi)`) and mirror the kEmoji table the firmware can render.
 */
export function EmojiPickerPanel({
  textareaRef,
  onInsert,
  maxLength,
  disabled,
}: Props) {
  // SUPPORTED_EMOJI is generated deduped, but keep the filter so future
  // regenerations can't accidentally surface duplicates in the strip.
  const emoji = useMemo(() => {
    const seen = new Set<string>();
    return SUPPORTED_EMOJI.filter((e) => {
      if (seen.has(e.char)) return false;
      seen.add(e.char);
      return true;
    });
  }, []);

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
    // Defer caret repositioning to after React's value update lands in the
    // DOM; otherwise el.setSelectionRange fires on the pre-update value.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const caret = Math.min(start + ch.length, maxLength);
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(caret, caret);
    });
  }

  return (
    <div
      role="group"
      aria-label="Desk stickers"
      className={cn(
        // Two-row preview, scroll to reveal the rest. `h-[7.5rem]` ~ two tile
        // rows including the label strip; tweak if tile sizing changes.
        "-mx-1 flex max-h-[7.5rem] flex-wrap content-start gap-1.5 overflow-y-auto px-1 py-1",
        // Subtle custom scrollbar so the "more below" affordance is visible
        // without being noisy.
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-rose-200",
        "[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      {emoji.map((e) => {
        const label = e.name ?? e.cp;
        return (
          <button
            key={e.cp}
            type="button"
            title={`${label} (${e.cp})`}
            onClick={() => insert(e.char)}
            disabled={disabled}
            className={cn(
              "group flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl",
              "w-16 border border-transparent bg-rose-50/40 px-1 py-2",
              "transition-all hover:-translate-y-0.5 hover:border-rose-200/70 hover:bg-rose-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "text-2xl leading-none text-plum-500",
                e.mdi && "font-mdi"
              )}
            >
              {e.char}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wider text-plum-300">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
