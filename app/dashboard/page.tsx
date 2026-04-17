import { DashboardDeskComposer } from "@/components/dashboard/DashboardDeskComposer";
import { DashboardDeskStatus } from "@/components/dashboard/DashboardDeskStatus";
import { QuickSendPresets } from "@/components/dashboard/QuickSendPresets";
import { MessageHistorySection } from "@/components/dashboard/MessageHistorySection";
import { AppLink } from "@/components/ui/AppLink";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchPairedDevicesForUser } from "@/lib/data/paired-devices";
import {
  attachDeviceNames,
  fetchMessageHistory,
} from "@/lib/messages/history";
import { parseMessageHistoryFilter } from "@/lib/messages/history-filters";
import { resolvePartnerUserId } from "@/lib/relationship/partner";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Your desk" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ history?: string }>;
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { history: historyParam } = await searchParams;
  const filter = parseMessageHistoryFilter(historyParam);

  const partnerId = await resolvePartnerUserId(supabase, user.id);
  const devices = await fetchPairedDevicesForUser(supabase, user.id);
  const pairedDeviceIds = devices.map((d) => d.id);
  const myDeskDeviceIds = devices
    .filter((d) => d.owner_id === user.id)
    .map((d) => d.id);
  const nameByDevice = new Map(devices.map((d) => [d.id, d.name]));

  const historyEntries = attachDeviceNames(
    await fetchMessageHistory(
      supabase,
      user.id,
      pairedDeviceIds,
      myDeskDeviceIds,
      filter
    ),
    nameByDevice
  );

  return (
    <>
      <PageHeader
        eyebrow="Your desk"
        title={
          <>
            {greeting()},{" "}
            <span className="italic text-rose-300">
              {user.email?.split("@")[0] ?? "love"}
            </span>
          </>
        }
        description="Messages you save here stay in your history and travel to the desks you pick."
      />

      {!partnerId ? (
        <Callout className="mb-6 sm:mb-8">
          <p>
            To include their desk in “both”, link once on the{" "}
            <AppLink href="/relationship" variant="inline" className="text-sm">
              Pair
            </AppLink>{" "}
            page — you can still message your own paired displays anytime.
          </p>
        </Callout>
      ) : null}

      <div className="space-y-7 sm:space-y-9">
        <DashboardDeskComposer
          devices={devices}
          hasPartner={!!partnerId}
          viewerUserId={user.id}
          partnerUserId={partnerId}
        />

        <QuickSendPresets
          devices={devices}
          hasPartner={!!partnerId}
          viewerUserId={user.id}
          partnerUserId={partnerId}
        />

        <DashboardDeskStatus
          devices={devices}
          viewerUserId={user.id}
          partnerUserId={partnerId}
        />

        <MessageHistorySection filter={filter} entries={historyEntries} />
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
