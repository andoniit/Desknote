import type { PairedDeviceRow } from "@/lib/data/paired-devices";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  devices: PairedDeviceRow[];
  viewerUserId: string;
  partnerUserId: string | null;
};

export function DashboardDeskStatus({
  devices,
  viewerUserId,
  partnerUserId,
}: Props) {
  if (devices.length === 0) {
    return (
      <section aria-labelledby="desk-status-heading" className="space-y-3">
        <SectionLabel id="desk-status-heading">Desks</SectionLabel>
        <EmptyState
          title="No displays yet"
          description="Pair an ESP32 from Devices — live online status for each desk will show up here."
          action={{ href: "/devices", label: "Open devices" }}
          contentClassName="mx-0 max-w-none text-left"
          actionAlign="start"
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="desk-status-heading" className="space-y-3">
      <SectionLabel id="desk-status-heading">Desks</SectionLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {devices.map((d) => (
          <DeskStatusMiniCard
            key={d.id}
            device={d}
            viewerUserId={viewerUserId}
            partnerUserId={partnerUserId}
          />
        ))}
      </div>
    </section>
  );
}

function DeskStatusMiniCard({
  device,
  viewerUserId,
  partnerUserId,
}: {
  device: PairedDeviceRow;
  viewerUserId: string;
  partnerUserId: string | null;
}) {
  const online = !!device.online;
  const who =
    device.owner_id === viewerUserId
      ? "Yours"
      : partnerUserId && device.owner_id === partnerUserId
        ? "Theirs"
        : "Shared";

  return (
    <div
      className={cn(
        "card flex flex-col gap-3 border-white/70 p-4",
        "transition-shadow hover:shadow-soft"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-plum-500">{device.name}</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-plum-200">
            {who}
          </p>
        </div>
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            online ? "bg-rose-400 shadow-[0_0_0_4px_rgba(217,138,138,0.2)]" : "bg-plum-200"
          )}
          aria-label={online ? "Online" : "Offline"}
        />
      </div>
      <p className="text-xs text-plum-300">
        {online ? (
          <span className="text-rose-400">Online</span>
        ) : (
          <span>Offline</span>
        )}
        <span className="mx-1 text-plum-200">·</span>
        <span>
          {device.last_seen_at
            ? formatRelativeTime(device.last_seen_at)
            : "never seen"}
        </span>
      </p>
    </div>
  );
}
