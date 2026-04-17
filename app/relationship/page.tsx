import { AppShell } from "@/components/AppShell";
import { RelationshipSetupForms } from "@/components/relationship/RelationshipSetupForms";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getRelationshipMemberCount,
  resolvePartnerUserId,
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

  const memberCount = await getRelationshipMemberCount(supabase, user.id);
  const partnerId = await resolvePartnerUserId(supabase, user.id);
  const fullyLinked = memberCount >= 2 && !!partnerId;
  const waitingForPartner = memberCount === 1;

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
      />
    </AppShell>
  );
}
