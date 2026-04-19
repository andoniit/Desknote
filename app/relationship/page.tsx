import { AppShell } from "@/components/AppShell";
import { RelationshipRealtime } from "@/components/relationship/RelationshipRealtime";
import { RelationshipSetupForms } from "@/components/relationship/RelationshipSetupForms";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  formatPartnerLabel,
  getRelationshipMemberCount,
  resolvePartnerInfo,
  resolveUnpairState,
} from "@/lib/relationship/partner";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Link your pair" };

export default async function RelationshipPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const partnerInfo = await resolvePartnerInfo(supabase, user.id);
  const { partnerId } = partnerInfo;
  const partnerLabel = formatPartnerLabel(partnerInfo);
  // desknote_my_partner() is the authoritative "linked" signal — it reads
  // relationship_members under SECURITY DEFINER and self-heals
  // profiles.partner_id. If it reports a partner, we're paired, full stop.
  const fullyLinked = !!partnerId;
  const memberCount = fullyLinked
    ? 2
    : await getRelationshipMemberCount(supabase, user.id);
  const waitingForPartner = !fullyLinked && memberCount === 1;
  const unpairState = fullyLinked
    ? await resolveUnpairState(supabase, user.id)
    : { kind: "none" as const };

  return (
    <AppShell>
      <RelationshipRealtime userId={user.id} partnerId={partnerId} />

      <PageHeader
        eyebrow="For two"
        title={
          <>
            Link your <span className="italic text-rose-300">desks together</span>
          </>
        }
        description="DeskNote is made for one pair. Create a short-lived invite code for your partner, or enter theirs — once you are linked, notes and devices are shared between you."
      />

      <RelationshipSetupForms
        fullyLinked={fullyLinked}
        waitingForPartner={waitingForPartner}
        userEmail={user.email ?? ""}
        partnerLabel={partnerLabel}
        unpairState={unpairState.kind}
      />
    </AppShell>
  );
}
