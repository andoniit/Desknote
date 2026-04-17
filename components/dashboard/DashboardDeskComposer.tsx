"use client";

import { useState, useTransition } from "react";
import { sendDeskMessages } from "@/app/actions/messages";
import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import { DESK_MESSAGE_MAX_LENGTH } from "@/lib/messages/validation";
import type { DeskMessageType } from "@/types/messages";
import { useDeskToast } from "@/components/providers/DeskToastProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { Textarea, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  devices: PairedDeviceRow[];
  hasPartner: boolean;
  viewerUserId: string;
  partnerUserId: string | null;
};

export function DashboardDeskComposer({
  devices,
  hasPartner,
  viewerUserId,
  partnerUserId,
}: Props) {
  const { push } = useDeskToast();
  const [body, setBody] = useState("");
  const [messageType, setMessageType] = useState<DeskMessageType>("standard");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => devices[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSendBoth = devices.length >= 2;

  function deskSubtitle(d: PairedDeviceRow) {
    if (d.owner_id === viewerUserId) return "Your display";
    if (partnerUserId && d.owner_id === partnerUserId) return "Their display";
    return "Shared";
  }

  async function submit(toDeviceIds: string[]) {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);

    startTransition(async () => {
      const result = await sendDeskMessages({
        content: trimmed,
        toDeviceIds,
        messageType,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBody("");
      setMessageType("standard");
      push(result.toast);
    });
  }

  if (!devices.length) {
    return (
      <EmptyState
        title="No desks to send to yet"
        description="Pair a display under Devices — then you can aim messages at one desk or both at once."
        action={{ href: "/devices", label: "Open devices" }}
      />
    );
  }

  return (
    <div
      className="card overflow-hidden shadow-card"
      aria-busy={isPending}
    >
      <PanelHeader
        title="Write a message"
        subtitle="Saved to your history and queued for the desk displays."
      />

      <div className="p-4 sm:p-5">
        <Label htmlFor="desk-message" className="sr-only">
          Message
        </Label>
        <Textarea
          id="desk-message"
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, DESK_MESSAGE_MAX_LENGTH));
            setMessageType("standard");
          }}
          placeholder="Something sweet, silly, or steady…"
          disabled={isPending}
          rows={4}
          className={cn(
            "min-h-[7.5rem] border-ash-200/60 bg-white/80 text-[16px] leading-relaxed",
            "placeholder:text-plum-200 focus:border-rose-200/80"
          )}
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-plum-200">
            {body.length}/{DESK_MESSAGE_MAX_LENGTH}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <Label htmlFor="target-device" className="text-[11px] uppercase tracking-[0.15em] text-plum-200">
              Send to one desk
            </Label>
            <select
              id="target-device"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={isPending}
              className="input mt-1.5 cursor-pointer text-[16px]"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {deskSubtitle(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="w-full sm:w-auto sm:min-w-[9rem]"
              disabled={isPending || !body.trim() || !selectedDeviceId}
              onClick={() => submit([selectedDeviceId])}
            >
              {isPending ? "Sending…" : "Send to selected desk"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto sm:min-w-[9rem]"
              disabled={isPending || !body.trim() || !canSendBoth}
              title={
                !canSendBoth
                  ? "Pair at least two displays to send to both at once"
                  : undefined
              }
              onClick={() => submit(devices.map((d) => d.id))}
            >
              Send to both desks
            </Button>
          </div>

          {!hasPartner && devices.length === 1 ? (
            <p className="text-xs text-plum-200">
              Link with your partner on the Pair page to add a second desk here.
            </p>
          ) : null}

          {isPending ? (
            <p className="text-center text-xs text-plum-300" aria-live="polite">
              Sending…
            </p>
          ) : null}
        </div>

        {error ? (
          <Notice tone="danger" role="alert" className="mt-3">
            {error}
          </Notice>
        ) : null}
      </div>

    </div>
  );
}
