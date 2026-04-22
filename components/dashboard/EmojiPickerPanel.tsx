"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SUPPORTED_EMOJI } from "@/lib/emoji/supported.gen";
import { cn } from "@/lib/utils";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (nextValue: string) => void;
  maxLength: number;
  valueLength: number;
  disabled?: boolean;
};

type HScrollUi = {
  canScroll: boolean;
  thumbW: number;
  thumbLeft: number;
};

/**
 * All stickers in one horizontal line; swipe / drag the row (or use the bar
 * below) to scroll. A slim track under the row shows where you are in the row.
 */
export function EmojiPickerPanel({
  textareaRef,
  onInsert,
  maxLength,
  valueLength,
  disabled,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [scrollUi, setScrollUi] = useState<HScrollUi>({
    canScroll: false,
    thumbW: 100,
    thumbLeft: 0,
  });

  const emoji = useMemo(() => {
    const seen = new Set<string>();
    return SUPPORTED_EMOJI.filter((e) => {
      if (seen.has(e.char)) return false;
      seen.add(e.char);
      return true;
    });
  }, []);

  const updateHScrollUi = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const canScroll = scrollWidth > clientWidth + 1;
    if (!canScroll) {
      setScrollUi({ canScroll: false, thumbW: 100, thumbLeft: 0 });
      return;
    }
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const thumbW = Math.min(
      100,
      Math.max(10, (clientWidth / scrollWidth) * 100)
    );
    const thumbLeft = (scrollLeft / maxScroll) * (100 - thumbW);
    setScrollUi({ canScroll: true, thumbW, thumbLeft });
  }, []);

  useLayoutEffect(() => {
    updateHScrollUi();
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateHScrollUi());
    ro.observe(el);
    return () => ro.disconnect();
  }, [emoji.length, updateHScrollUi]);

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

  /** Tap track: jump scroll position to match click (left = start, right = end). */
  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const row = rowRef.current;
    if (!row || !scrollUi.canScroll) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const maxScroll = row.scrollWidth - row.clientWidth;
    row.scrollLeft = Math.round(ratio * maxScroll);
    updateHScrollUi();
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
        {/* Single horizontal line of every sticker */}
        <div
          ref={rowRef}
          role="group"
          aria-label="Desk stickers"
          onScroll={updateHScrollUi}
          className={cn(
            "scrollbar-none flex flex-nowrap gap-1.5 overflow-x-auto px-2 py-2",
            "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                  "flex h-[3.25rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-rose-100/70 bg-white/70 px-0.5 py-1",
                  "transition-all hover:border-rose-200/80 hover:bg-white hover:shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200",
                  e.mdi && "font-mdi"
                )}
              >
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

        {/* Horizontal scroll slider under the row (only when the row overflows). */}
        {scrollUi.canScroll ? (
          <div className="border-t border-rose-100/80 bg-rose-50/80 px-2 py-2">
            <div
              role="presentation"
              className="relative h-2 w-full cursor-pointer rounded-full bg-rose-100/90 touch-none"
              onPointerDown={onTrackPointerDown}
            >
              <div
                className="pointer-events-none absolute top-0 h-full rounded-full bg-rose-400/90 shadow-sm transition-[width,left] duration-75 ease-out"
                style={{
                  width: `${scrollUi.thumbW}%`,
                  left: `${scrollUi.thumbLeft}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-center text-[9px] font-medium uppercase tracking-wider text-plum-300">
              Swipe the row or tap the bar to move
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
