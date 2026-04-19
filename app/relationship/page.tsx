import { AppShell } from "@/components/AppShell";
import { RelationshipSetupForms } from "@/components/relationship/RelationshipSetupForms";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getRelationshipMemberCount,
  resolvePartnerDisplayName,
  resolvePartnerUserId,
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

  const partnerId = await resolvePartnerUserId(supabase, user.id);
  // profiles.partner_id is the authoritative "linked" flag — both partners'
  // rows get set by desknote_join_invite and are always readable under the
  // "profiles self" policy. relationship_members visibility through RLS is
  // unreliable for the non-caller row, so don't gate the paired card on it.
  const fullyLinked = !!partnerId;
  const memberCount = fullyLinked
    ? 2
    : await getRelationshipMemberCount(supabase, user.id);
  const waitingForPartner = !fullyLinked && memberCount === 1;
  const partnerLabel = fullyLinked
    ? await resolvePartnerDisplayName(supabase, partnerId)
    : null;
  const unpairState = fullyLinked
    ? await resolveUnpairState(supabase, user.id)
    : { kind: "none" as const };

  return (
    <AppShell>
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
