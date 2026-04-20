import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { UnpairDeviceButton } from "@/components/devices/UnpairDeviceButton";
import { themeLabel } from "@/lib/devices/themes";
import { cn, formatRelativeTime } from "@/lib/utils";

export type DeviceCardModel = {
  id: string;
  name: string;
  location_name: string | null;
  theme: string | null;
  firmware_version: string | null;
  online: boolean | null;
  last_seen_at: string | null;
};

export function DeviceCard({
  device,
  isOwner = false,
}: {
  device: DeviceCardModel;
  isOwner?: boolean;
}) {
  const online = !!device.online;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">{device.name}</CardTitle>
          <CardDescription className="mt-1">
            {device.location_name ? (
              <span>{device.location_name}</span>
            ) : (
              <span className="text-plum-200">No room label yet</span>
            )}
            <span className="mx-1.5 text-plum-200">·</span>
            <span>Theme: {themeLabel(device.theme)}</span>
          </CardDescription>
        </div>
        <span
          className={cn(
            "chip shrink-0",
            online ? "bg-rose-50 text-rose-400" : "bg-ash-200/60 text-plum-300"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              online ? "bg-rose-400 animate-pulse" : "bg-plum-200"
            )}
          />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-plum-300">
        <div className="flex justify-between gap-3">
          <dt className="text-plum-200">Firmware</dt>
          <dd className="font-medium text-plum-400">
            {device.firmware_version ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-plum-200">Last seen</dt>
          <dd className="font-medium text-plum-400">
            {device.last_seen_at
              ? formatRelativeTime(device.last_seen_at)
              : "— never"}
          </dd>
        </div>
      </dl>

      {isOwner && (
        <div className="mt-2 border-t border-ash-200/70 pt-3">
          <UnpairDeviceButton deviceId={device.id} deviceName={device.name} />
        </div>
      )}
    </Card>
  );
}
