import { AppShell } from "@/components/AppShell";
import { DeviceSettingsForm } from "@/components/settings/DeviceSettingsForm";
import { ProfileNameForm } from "@/components/settings/ProfileNameForm";
import { AppLink } from "@/components/ui/AppLink";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { signOut } from "@/app/actions/auth";
import { fetchOwnedDevicesForUser } from "@/lib/data/paired-devices";
import { fetchOwnDisplayName } from "@/lib/profile/display-name";
import {
  getRelationshipMemberCount,
  resolvePartnerDisplayName,
  resolvePartnerUserId,
} from "@/lib/relationship/partner";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const partnerId = await resolvePartnerUserId(supabase, user.id);
  const linked = !!partnerId;
  const memberCount = linked
    ? 2
    : await getRelationshipMemberCount(supabase, user.id);
  const waiting = !linked && memberCount === 1;

  const partnerName = linked
    ? await resolvePartnerDisplayName(supabase, partnerId)
    : null;
  const partnerHint = partnerName ?? "your partner";

  const ownDisplayName = await fetchOwnDisplayName(supabase, user.id);
  const ownedDevices = await fetchOwnedDevicesForUser(supabase, user.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title={
          <>
            Just the <span className="italic text-rose-300">essentials</span>
          </>
        }
      />

      <div className="grid gap-5 sm:gap-6">
        <Card>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </Card>

        <ProfileNameForm currentName={ownDisplayName} />

        <section aria-labelledby="desk-settings-heading" className="space-y-3 sm:space-y-4">
          <SectionLabel id="desk-settings-heading">Your desks</SectionLabel>
          {ownedDevices.length === 0 ? (
            <EmptyState
              title="No desks on your account yet"
              description="Pair a display under Devices — then you can name it, set where it lives, and tune how messages behave."
              action={{ href: "/devices", label: "Open devices" }}
            />
          ) : (
            <div className="grid gap-4 sm:gap-5">
              {ownedDevices.map((d) => (
                <DeviceSettingsForm key={d.id} device={d} />
              ))}
            </div>
          )}
        </section>

        <Card>
          <CardTitle>Your pair</CardTitle>
          <CardDescription>
            {linked
              ? `You are linked with ${partnerHint}. Notes and devices are shared between your accounts.`
              : waiting
                ? "We are still waiting for your partner to enter your invite code. You can create a fresh code from the Pair page."
                : "Create an invite code or join with your partner’s code to share notes and desk devices."}
          </CardDescription>
          <div className="mt-5">
            <AppLink href="/relationship" variant="secondary">
              {linked ? "Manage pairing" : "Open pairing"}
            </AppLink>
          </div>
        </Card>

        <Card>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>
            You can come back whenever you like.
          </CardDescription>
          <form action={signOut} className="mt-4">
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
