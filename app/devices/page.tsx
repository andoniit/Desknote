import { AppShell } from "@/components/AppShell";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { PairDeviceForm } from "@/components/devices/PairDeviceForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchPairedDevicesForUser } from "@/lib/data/paired-devices";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Devices" };

export default async function DevicesPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const list = await fetchPairedDevicesForUser(supabase, user.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Devices"
        title={
          <>
            Two desks, <span className="italic text-rose-300">one conversation</span>
          </>
        }
        description="Pair each ESP32 once, give it a name and a corner of your home, then watch when it was last awake."
      />

      <div className="mb-8 max-w-xl sm:mb-10">
        <PairDeviceForm />
      </div>

      <section className="space-y-3 sm:space-y-4">
        <SectionLabel as="h2">Your desks</SectionLabel>

        {list.length === 0 ? (
          <EmptyState
            className="text-left"
            title="No desks paired yet"
            description="When you claim a display with its six-digit code, it will show up here with live status."
            contentClassName="mx-0 max-w-none"
          >
            <p className="mt-3 text-xs leading-relaxed text-plum-300">
              Firmware can register a new code with{" "}
              <code className="rounded-lg bg-blush-50/90 px-1.5 py-0.5 font-mono text-[11px] text-plum-400">
                POST /api/device/register
              </code>{" "}
              using the same device key as the notes API.
            </p>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            {list.map((d) => (
              <DeviceCard
                key={d.id}
                isOwner={d.owner_id === user.id}
                device={{
                  id: d.id,
                  name: d.name,
                  location_name: d.location_name,
                  theme: d.theme,
                  firmware_version: d.firmware_version,
                  online: d.online,
                  last_seen_at: d.last_seen_at,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
