import { DashboardDeskComposer } from "@/components/dashboard/DashboardDeskComposer";
import { DashboardDeskStatus } from "@/components/dashboard/DashboardDeskStatus";
import { QuickSendPresets } from "@/components/dashboard/QuickSendPresets";
import { MessageHistorySection } from "@/components/dashboard/MessageHistorySection";
import { RelationshipRealtime } from "@/components/relationship/RelationshipRealtime";
import { AppLink } from "@/components/ui/AppLink";
import { Callout } from "@/components/ui/Callout";
import { PageHeader } from "@/components/ui/PageHeader";
import { fetchPairedDevicesForUser } from "@/lib/data/paired-devices";
import { attachDeviceNames, fetchMessageHistoryPage } from "@/lib/messages/history";
import {
  parseMessageHistoryFilter,
  parseMessageHistoryPage,
} from "@/lib/messages/history-filters";
import { fetchOwnDisplayName } from "@/lib/profile/display-name";
import {
  formatPartnerLabel,
  resolvePartnerInfo,
} from "@/lib/relationship/partner";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Your desk" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ history?: string; page?: string }>;
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { history: historyParam, page: pageParam } = await searchParams;
  const filter = parseMessageHistoryFilter(historyParam);
  const requestedPage = parseMessageHistoryPage(pageParam);

  const partnerInfo = await resolvePartnerInfo(supabase, user.id);
  const { partnerId } = partnerInfo;
  const partnerLabel = formatPartnerLabel(partnerInfo);
  const ownDisplayName = await fetchOwnDisplayName(supabase, user.id);
  const viewerLabel =
    ownDisplayName ?? user.email?.split("@")[0] ?? "love";
  const devices = await fetchPairedDevicesForUser(supabase, user.id);
  const pairedDeviceIds = devices.map((d) => d.id);
  const myDeskDeviceIds = devices
    .filter((d) => d.owner_id === user.id)
    .map((d) => d.id);
  const nameByDevice = new Map(devices.map((d) => [d.id, d.name]));

  const historyResult = await fetchMessageHistoryPage(
    supabase,
    user.id,
    pairedDeviceIds,
    myDeskDeviceIds,
    filter,
    requestedPage
  );

  if (historyResult.totalCount > 0 && requestedPage > historyResult.pageCount) {
    const p = new URLSearchParams();
    if (filter !== "all") p.set("history", filter);
    if (historyResult.pageCount > 1) {
      p.set("page", String(historyResult.pageCount));
    }
    const q = p.toString();
    redirect(q ? `/dashboard?${q}` : "/dashboard");
  }

  const historyEntries = attachDeviceNames(historyResult.entries, nameByDevice);

  return (
    <>
      <RelationshipRealtime userId={user.id} partnerId={partnerId} />

      <PageHeader
        eyebrow="Your desk"
        title={
          <>
            {greeting()},{" "}
            <span className="italic text-rose-300">{viewerLabel}</span>
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
      ) : (
        <Callout className="mb-6 sm:mb-8">
          <p>
            Paired with{" "}
            <span className="font-medium text-plum-500">{partnerLabel}</span>
            . Notes and devices are shared between your desks —{" "}
            <AppLink href="/relationship" variant="inline" className="text-sm">
              manage pairing
            </AppLink>
            .
          </p>
        </Callout>
      )}

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

        <MessageHistorySection
          filter={filter}
          entries={historyEntries}
          page={historyResult.page}
          pageCount={historyResult.pageCount}
          totalCount={historyResult.totalCount}
          perPage={historyResult.perPage}
        />
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
