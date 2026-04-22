"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { sendDeskMessages } from "@/app/actions/messages";
import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import { deskStickerByName } from "@/lib/emoji/desk-sticker";
import { QUICK_SEND_PRESETS, type QuickSendTargetId } from "@/lib/messages/quick-presets";
import { resolveQuickSendDeviceIds } from "@/lib/messages/quick-send-resolve";
import { useDeskToast } from "@/components/providers/DeskToastProvider";
import { Notice } from "@/components/ui/Notice";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { cn } from "@/lib/utils";

/** MDI PUA — same as “Desk stickers” / firmware (heart / hug / sun). */
const STICKER_TARGET = {
  mine: deskStickerByName("heart"),
  partner: deskStickerByName("hug"),
  both: deskStickerByName("sun"),
} as const;

type Props = {
  devices: PairedDeviceRow[];
  hasPartner: boolean;
  viewerUserId: string;
  partnerUserId: string | null;
};

export function QuickSendPresets(props: Props) {
  const { devices, hasPartner, viewerUserId, partnerUserId } = props;
  const { push } = useDeskToast();
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const targets = useMemo(() => {
    const mine = devices.filter((d) => d.owner_id === viewerUserId);
    const theirs = partnerUserId
      ? devices.filter((d) => d.owner_id === partnerUserId)
      : [];

    const formatNames = (list: typeof devices) =>
      list.map((d) => d.name).join(" & ");

    const out: {
      id: QuickSendTargetId;
      label: string;
      sticker: string;
    }[] = [];

    if (mine.length > 0) {
      out.push({
        id: "my_desk",
        label: formatNames(mine),
        sticker: STICKER_TARGET.mine,
      });
    }
    if (hasPartner && theirs.length > 0) {
      out.push({
        id: "her_desk",
        label: formatNames(theirs),
        sticker: STICKER_TARGET.partner,
      });
    }
    if (hasPartner && mine.length > 0 && theirs.length > 0) {
      out.push({ id: "both", label: "Both", sticker: STICKER_TARGET.both });
    }
    return out;
  }, [devices, hasPartner, partnerUserId, viewerUserId]);

  const [target, setTarget] = useState<QuickSendTargetId>(
    () => targets[0]?.id ?? "my_desk"
  );

  // If the desk lineup changes (user unpairs, partner pairs), snap the
  // selected target back to the first still-available option.
  useEffect(() => {
    if (targets.length === 0) return;
    if (!targets.some((t) => t.id === target)) {
      setTarget(targets[0].id);
    }
  }, [target, targets]);

  // No sendable desk at all - hide the whole panel.
  if (!devices.length || targets.length === 0) return null;

  function sendPreset(text: string, presetId: string) {
    setError(null);
    const resolved = resolveQuickSendDeviceIds(
      target,
      devices,
      viewerUserId,
      partnerUserId
    );

    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }

    startTransition(async () => {
      setSendingId(presetId);
      const result = await sendDeskMessages({
        content: text,
        toDeviceIds: resolved.deviceIds,
        messageType: "quick_send",
      });
      setSendingId(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      push(result.toast);
    });
  }

  return (
    <div
      className="card overflow-hidden border-rose-100/35 bg-gradient-to-b from-white/85 to-blush-50/35 shadow-card"
      aria-busy={isPending}
    >
      <PanelHeader
        className="border-white/50"
        title="Little taps"
        subtitle="Pick where it goes, then tap — off it flies."
      />

      <div className="px-4 py-3 sm:px-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-plum-200">
          Send to
        </p>
        <div className="flex gap-1.5">
          {targets.map((t) => {
            const active = target === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.label}
                onClick={() => setTarget(t.id)}
                className={cn(
                  "min-h-10 min-w-0 flex-1 rounded-2xl px-1.5 py-2 text-xs font-medium transition-all sm:px-2.5",
                  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100/80",
                  active
                    ? "bg-plum-500 text-cream shadow-soft"
                    : "bg-white/80 text-plum-400 ring-1 ring-plum-100/60 hover:bg-blush-50/90 hover:text-plum-500"
                )}
              >
                <span className="flex min-w-0 items-center justify-center gap-1">
                  {t.sticker ? (
                    <span
                      aria-hidden
                      className="font-mdi shrink-0 text-[0.95rem] leading-none sm:text-base"
                    >
                      {t.sticker}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate">{t.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrollbar-none flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
        {QUICK_SEND_PRESETS.map((p) => {
          const busy = isPending && sendingId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={isPending}
              onClick={() => sendPreset(p.text, p.id)}
              className={cn(
                "font-mdi-fallback rounded-2xl border border-rose-100/70 bg-white/90 px-3.5 py-2.5 text-left text-sm",
                "font-medium text-plum-500 shadow-sm transition-all active:scale-[0.98]",
                "min-h-11 min-w-[6.5rem] flex-1 basis-[calc(50%-0.25rem)] sm:basis-auto sm:flex-initial",
                "hover:border-rose-200 hover:bg-rose-50/50 hover:shadow-soft",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100/70",
                "disabled:opacity-50",
                busy && "animate-pulse ring-2 ring-rose-100"
              )}
            >
              {busy ? "…" : p.text}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="border-t border-rose-100/35 px-4 py-3 sm:px-5">
          <Notice tone="danger" role="alert" className="text-center text-xs sm:text-sm">
            {error}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
