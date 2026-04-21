"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 * Grid of emoji the desk firmware can render (mirrored from kEmoji at build
 * time via scripts/gen_emoji_assets.py). We deliberately render each glyph
 * with the user's OS emoji font in the picker — it's small enough to read at
 * a glance, and the on-desk pixel-art look only happens after send.
 */
export function EmojiPickerPanel({
  textareaRef,
  onInsert,
  maxLength,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Dedupe once — SUPPORTED_EMOJI already is deduped by the generator, but
  // being defensive keeps the UI stable if that ever changes.
  const emoji = useMemo(() => {
    const seen = new Set<string>();
    return SUPPORTED_EMOJI.filter((e) => {
      if (seen.has(e.char)) return false;
      seen.add(e.char);
      return true;
    });
  }, []);

  // Clicking outside the panel closes it. We listen on mousedown so the
  // click that lands on an emoji tile still fires its onClick first.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

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
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-100/70",
          "bg-white/85 px-3 text-xs font-medium text-plum-400 shadow-sm transition-all",
          "hover:border-rose-200 hover:bg-rose-50/60 hover:text-plum-500",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100/70",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        <span aria-hidden="true" className="text-base leading-none">
          😊
        </span>
        <span>Emoji</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick an emoji"
          className={cn(
            "absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))]",
            "rounded-2xl border border-rose-100/70 bg-white/95 p-2 shadow-card",
            "backdrop-blur"
          )}
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-plum-200">
              Desk-safe emoji
            </p>
            <span className="text-[10px] text-plum-200">{emoji.length}</span>
          </div>
          <div className="scrollbar-none max-h-64 overflow-y-auto">
            <div className="grid grid-cols-8 gap-0.5">
              {emoji.map((e) => (
                <button
                  key={e.cp}
                  type="button"
                  title={e.cp}
                  onClick={() => insert(e.char)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-lg",
                    "transition-colors hover:bg-rose-50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  )}
                >
                  <span aria-hidden="true">{e.char}</span>
                  <span className="sr-only">{e.cp}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
