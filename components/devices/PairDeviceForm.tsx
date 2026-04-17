"use client";

import { useActionState } from "react";
import { claimDeviceAction, type ClaimDeviceState } from "@/app/actions/devices";
import { DEVICE_THEMES } from "@/lib/devices/themes";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { Input, Label } from "@/components/ui/Input";

export function PairDeviceForm() {
  const [state, formAction, pending] = useActionState(
    claimDeviceAction,
    null as ClaimDeviceState | null
  );

  return (
    <Card className="border-dashed border-rose-100/60 bg-white/60 shadow-none">
      <CardTitle>Pair a new desk</CardTitle>
      <CardDescription className="mt-2">
        When the display powers up for the first time, it shows a six-digit code. Enter
        that code here, name the desk, and choose a look — only your signed-in account
        can claim it.
      </CardDescription>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="pairing_code">Pairing code</Label>
          <Input
            id="pairing_code"
            name="pairing_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="e.g. 482910"
            maxLength={14}
            className="mt-1.5 font-mono tracking-[0.2em]"
            aria-describedby="pairing_code_hint"
          />
          <p id="pairing_code_hint" className="mt-2 text-xs text-plum-200">
            Six digits, exactly as on the screen — spaces are fine.
          </p>
        </div>

        <div>
          <Label htmlFor="device_name">Desk name</Label>
          <Input
            id="device_name"
            name="name"
            placeholder='e.g. "Her desk" or "Kitchen nook"'
            maxLength={48}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="location_name">Room or place (optional)</Label>
          <Input
            id="location_name"
            name="location_name"
            placeholder="e.g. Bedroom, studio apartment"
            maxLength={64}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="theme">Theme on the display</Label>
          <select
            id="theme"
            name="theme"
            className="input mt-1.5 cursor-pointer"
            defaultValue="cream"
          >
            {DEVICE_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </div>

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

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Pairing…" : "Pair this desk"}
        </Button>
      </form>
    </Card>
  );
}
