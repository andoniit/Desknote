"use client";

import { useActionState, useTransition } from "react";
import {
  unpairDeviceAction,
  type UnpairDeviceState,
} from "@/app/actions/devices";
import { Notice } from "@/components/ui/Notice";
import { cn } from "@/lib/utils";

type Props = {
  deviceId: string;
  deviceName: string;
  className?: string;
};

/**
 * Destructive "Unpair desk" button shown only to the desk's owner. Uses a
 * native confirm() so we don't pull in a modal library for a one-liner -
 * the consequences are fully recoverable (re-pair with the fresh code
 * the display will show after a power-cycle) so a lightweight prompt is
 * proportional to the action.
 */
export function UnpairDeviceButton({ deviceId, deviceName, className }: Props) {
  const [state, formAction] = useActionState<UnpairDeviceState | null, FormData>(
    unpairDeviceAction,
    null
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("space-y-2", className)}>
      <form
        action={(formData) => {
          const confirmed = window.confirm(
            `Unpair "${deviceName}"? The display will flash a new six-digit code on its next power-cycle so you can re-claim it (or hand it to someone else).`
          );
          if (!confirmed) return;
          startTransition(() => formAction(formData));
        }}
      >
        <input type="hidden" name="device_id" value={deviceId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Unpairing..." : "Unpair desk"}
        </button>
      </form>

      {state && (
        <Notice tone={state.ok ? "success" : "danger"}>{state.message}</Notice>
      )}
    </div>
  );
}
