"use client";

import { useActionState } from "react";
import {
  updateDeviceSettingsAction,
  type UpdateDeviceSettingsState,
} from "@/app/actions/devices";
import { DEVICE_ACCENTS } from "@/lib/devices/accents";
import { DEVICE_NOTE_CARD_BACKGROUNDS } from "@/lib/devices/note-card-background";
import { DEVICE_THEMES } from "@/lib/devices/themes";
import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import { isDeviceAccentId } from "@/lib/devices/accents";
import { isDeviceNoteCardBackgroundId } from "@/lib/devices/note-card-background";
import { isDeviceThemeId } from "@/lib/devices/themes";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { Input, Label } from "@/components/ui/Input";
import { SettingsSwitchField } from "@/components/settings/SettingsSwitchField";
import { cn } from "@/lib/utils";

type Props = {
  device: PairedDeviceRow;
  disabled?: boolean;
};

function defaultTheme(device: PairedDeviceRow): string {
  const t = device.theme?.trim().toLowerCase() ?? "";
  return isDeviceThemeId(t) ? t : "cream";
}

function defaultAccent(device: PairedDeviceRow): string {
  const a = device.accent_color?.trim().toLowerCase() ?? "";
  return isDeviceAccentId(a) ? a : "rose";
}

function defaultNoteCardBackground(device: PairedDeviceRow): string {
  const v = device.note_card_background?.trim().toLowerCase() ?? "";
  return isDeviceNoteCardBackgroundId(v) ? v : "match_theme";
}

export function DeviceSettingsForm({ device, disabled }: Props) {
  const [state, formAction, pending] = useActionState(
    updateDeviceSettingsAction,
    null as UpdateDeviceSettingsState | null
  );

  const themeInit = defaultTheme(device);
  const accentInit = defaultAccent(device);
  const noteCardInit = defaultNoteCardBackground(device);
  const pinnedInit = device.pinned_mode_enabled === true;

  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <PanelHeader
        title={device.name}
        subtitle="Only you can edit this desk — it lives on your account."
      />

      <form action={formAction} className="space-y-5 p-4 sm:p-5">
        <input type="hidden" name="device_id" value={device.id} />

        <div>
          <Label htmlFor={`name-${device.id}`}>Desk name</Label>
          <Input
            id={`name-${device.id}`}
            name="name"
            defaultValue={device.name}
            maxLength={48}
            disabled={disabled || pending}
            className="mt-1.5 text-[16px]"
            required
          />
        </div>

        <div>
          <Label htmlFor={`loc-${device.id}`}>Location label</Label>
          <Input
            id={`loc-${device.id}`}
            name="location_name"
            defaultValue={device.location_name ?? ""}
            maxLength={64}
            disabled={disabled || pending}
            placeholder="e.g. Bedroom, her studio"
            className="mt-1.5 text-[16px]"
          />
          <p className="mt-1.5 text-xs text-plum-200">Optional — shows in lists and on the desk card.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-plum-400">Desk frame &amp; menus</legend>
          <p className="text-xs text-plum-200">
            Top bar and paired / waiting screens on the physical desk — not the big message letter
            (that is the next section).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEVICE_THEMES.map((t) => (
              <label
                key={t.id}
                className={cn(
                  "flex cursor-pointer flex-col rounded-2xl border border-ash-200/70 bg-white/60 px-3 py-3 transition",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-rose-100/80",
                  "has-[:checked]:border-rose-200 has-[:checked]:bg-blush-50/60 has-[:checked]:shadow-soft"
                )}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="theme"
                    value={t.id}
                    defaultChecked={themeInit === t.id}
                    disabled={disabled || pending}
                    className="mt-1 h-4 w-4 shrink-0 border-ash-300 text-plum-400 focus:ring-rose-200"
                  />
                  <span>
                    <span className="block text-sm font-medium text-plum-500">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-plum-300">{t.hint}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-plum-400">Accent color</legend>
          <p className="text-xs text-plum-200">
            Highlights in the web app and on the desk <span className="font-medium">header</span>{" "}
            (badges, links, firmware chip). Same palette as when you pick Rose, Blush, Plum, Sage, or
            Cream here.
          </p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {DEVICE_ACCENTS.map((a) => (
              <label
                key={a.id}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-2xl px-2 py-2 transition",
                  "has-[:focus-within]:ring-4 has-[:focus-within]:ring-rose-100/80",
                  "has-[:checked]:bg-white/80 has-[:checked]:shadow-soft"
                )}
              >
                <input
                  type="radio"
                  name="accent_color"
                  value={a.id}
                  defaultChecked={accentInit === a.id}
                  disabled={disabled || pending}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "h-10 w-10 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-cream-100/80",
                    a.swatch,
                    "peer-checked:ring-plum-400"
                  )}
                  title={a.label}
                  aria-hidden
                />
                <span className="text-center text-[11px] font-medium text-plum-400">{a.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-plum-400">Message letter on the desk</legend>
          <p className="text-xs text-plum-200">
            The large rounded card where notes appear. Choose light paper, a dark card with light
            type, or colors that follow <span className="font-medium">Desk frame &amp; menus</span>{" "}
            above (with automatic light text if that style is dark).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DEVICE_NOTE_CARD_BACKGROUNDS.map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  "flex cursor-pointer flex-col rounded-2xl border border-ash-200/70 bg-white/60 px-3 py-3 transition",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-rose-100/80",
                  "has-[:checked]:border-rose-200 has-[:checked]:bg-blush-50/60 has-[:checked]:shadow-soft"
                )}
              >
                <span className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="note_card_background"
                    value={opt.id}
                    defaultChecked={noteCardInit === opt.id}
                    disabled={disabled || pending}
                    className="mt-1 h-4 w-4 shrink-0 border-ash-300 text-plum-400 focus:ring-rose-200"
                  />
                  <span>
                    <span className="block text-sm font-medium text-plum-500">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-plum-300">{opt.hint}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <SettingsSwitchField
          id={`pinned-${device.id}`}
          name="pinned_mode_enabled"
          defaultChecked={pinnedInit}
          disabled={disabled || pending}
          title="Pinned message mode"
          description="When on, new messages to this desk are saved as pinned unless you turn this off again here."
        />

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

        <Button type="submit" disabled={disabled || pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save desk settings"}
        </Button>
      </form>
    </Card>
  );
}
