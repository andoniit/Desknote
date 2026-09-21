"use client";

import { useActionState } from "react";
import {
  requestFirmwareUpdateAction,
  type RequestFirmwareUpdateState,
} from "@/app/actions/devices";
import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import type { FirmwareRelease } from "@/lib/data/firmware";
import { firmwarePhase } from "@/lib/devices/firmware-status";
import { formatMessageRelative } from "@/lib/messages/format-time";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

type Props = {
  device: PairedDeviceRow;
  latest: FirmwareRelease | null;
};

/**
 * Which firmware a desk runs, and the button that asks it to update itself.
 * Nothing is installed from the browser: the request is recorded, the desk is
 * poked over MQTT, and it downloads, checks and installs the signed image.
 */
export function FirmwareUpdatePanel({ device, latest }: Props) {
  const [state, formAction, pending] = useActionState(
    requestFirmwareUpdateAction,
    null as RequestFirmwareUpdateState | null
  );
  const phase = firmwarePhase(device, latest?.version ?? null);

  const updateButton = (label: string) => (
    <form action={formAction}>
      <input type="hidden" name="device_id" value={device.id} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Asking the desk…" : label}
      </Button>
    </form>
  );

  return (
    <div className="space-y-3 border-t border-ash-200/70 p-4 sm:p-5">
      <p className="text-sm font-medium text-plum-400">Firmware</p>

      {phase.kind === "unknown" ? (
        <p className="text-sm text-plum-300">This desk has not reported its version yet.</p>
      ) : null}

      {phase.kind === "needs_usb" ? (
        <>
          <p className="text-sm text-plum-300">
            {phase.current ? `Running ${phase.current}.` : "Version not reported yet."}
          </p>
          <Notice tone="info">
            This firmware predates over-the-air updates. Flash it over USB once with{" "}
            <code>scripts/flash-desk.sh</code> — after that, updates come from here.
          </Notice>
        </>
      ) : null}

      {phase.kind === "working" ? (
        <>
          <p className="text-sm text-plum-300" role="status">
            {phase.downloading
              ? `Installing ${phase.target}… keep the desk plugged in. It restarts when it's done.`
              : `Update to ${phase.target} requested — the desk should start in a moment.`}
          </p>
          {phase.stale && phase.since ? (
            <Notice tone="info">
              Asked {formatMessageRelative(phase.since)} and not finished. Is the desk switched on
              and online? It picks this up as soon as it is.
            </Notice>
          ) : null}
        </>
      ) : null}

      {phase.kind === "failed" ? (
        <>
          {phase.current ? (
            <p className="text-sm text-plum-300">Still on {phase.current}.</p>
          ) : null}
          <Notice tone="danger">The last update didn&apos;t install: {phase.reason}.</Notice>
          {updateButton("Try again")}
        </>
      ) : null}

      {phase.kind === "up_to_date" ? (
        <p className="text-sm text-plum-300">Up to date — {phase.current}.</p>
      ) : null}

      {phase.kind === "available" ? (
        <>
          <p className="text-sm text-plum-300">
            {phase.current
              ? `Running ${phase.current}. ${phase.latest} is available.`
              : `${phase.latest} is available.`}
          </p>
          {latest?.notes ? <p className="text-xs text-plum-200">{latest.notes}</p> : null}
          {updateButton(`Update to ${phase.latest}`)}
        </>
      ) : null}

      {state && !state.ok ? (
        <Notice tone="danger" role="alert">
          {state.message}
        </Notice>
      ) : null}
      {state?.ok ? (
        <Notice tone="success" role="status">
          {state.message}
        </Notice>
      ) : null}
    </div>
  );
}
