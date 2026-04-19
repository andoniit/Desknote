"use client";

import { useActionState } from "react";
import {
  createInviteAction,
  joinInviteAction,
  toggleUnpairAction,
  type CreateInviteState,
  type JoinInviteState,
  type UnpairToggleState,
} from "@/app/actions/relationship";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";

type UnpairKind = "none" | "requested_by_me" | "requested_by_partner";

type Props = {
  fullyLinked: boolean;
  waitingForPartner: boolean;
  userEmail: string;
  partnerLabel?: string | null;
  unpairState?: UnpairKind;
};

export function RelationshipSetupForms({
  fullyLinked,
  waitingForPartner,
  userEmail,
  partnerLabel,
  unpairState = "none",
}: Props) {
  const [inviteState, inviteAction, invitePending] = useActionState(
    createInviteAction,
    null as CreateInviteState | null
  );
  const [joinState, joinAction, joinPending] = useActionState(
    joinInviteAction,
    null as JoinInviteState | null
  );
  const [unpairResult, unpairAction, unpairPending] = useActionState(
    toggleUnpairAction,
    null as UnpairToggleState | null
  );

  if (fullyLinked) {
    return (
      <PairedCard
        partnerLabel={partnerLabel}
        unpairState={unpairState}
        unpairAction={unpairAction}
        unpairPending={unpairPending}
        unpairResult={unpairResult}
      />
    );
  }

  return (
    <div className="grid gap-8 sm:gap-10 lg:grid-cols-2">
      <section className="space-y-4 sm:space-y-5">
        <SectionTitle
          title="Share an invite"
          description="Create a one-time code for your partner. It stays gentle but private — treat it like a house key."
        />

        {waitingForPartner ? (
          <Notice tone="info">
            You already started a pair and we are waiting for your partner to enter the
            code. You can create a fresh code below; the old one will stop working.
          </Notice>
        ) : null}

        <Card className="border-white/80">
          <form action={inviteAction} className="space-y-4">
            <div>
              <Label htmlFor="invited_email">Partner email (optional)</Label>
              <Input
                id="invited_email"
                name="invited_email"
                type="email"
                autoComplete="email"
                placeholder="them@example.com"
                defaultValue=""
                className="mt-1.5"
              />
              <p className="mt-2 text-xs text-plum-200">
                If you add an email, only someone signed in with that exact address can use
                the code — handy if you want an extra layer of certainty.
              </p>
            </div>

            {inviteState && !inviteState.ok ? (
              <Notice tone="danger" role="alert">
                {inviteState.message}
              </Notice>
            ) : null}

            {inviteState?.ok ? (
              <Notice tone="success" role="status" className="space-y-3 py-4">
                <p className="font-medium text-plum-500">Here is your invite code</p>
                <p className="font-mono text-lg tracking-widest text-plum-500">
                  {inviteState.code}
                </p>
                <p className="text-xs leading-relaxed text-plum-300">
                  It expires on{" "}
                  <time dateTime={inviteState.expiresAt}>
                    {formatExpiry(inviteState.expiresAt)}
                  </time>
                  . Share it in person or through a channel you already trust.
                </p>
              </Notice>
            ) : null}

            <Button type="submit" disabled={invitePending} className="w-full sm:w-auto">
              {invitePending ? "Creating…" : "Create invite code"}
            </Button>
          </form>
        </Card>
      </section>

      <section className="space-y-4 sm:space-y-5">
        <SectionTitle
          title="Join with a code"
          description={
            <>
              Paste the code your partner created. You are signed in as{" "}
              <span className="font-medium text-plum-400">{userEmail || "this account"}</span>.
            </>
          }
        />

        <Card className="border-white/80">
          <form action={joinAction} className="space-y-4">
            <div>
              <Label htmlFor="join_code">Invite code</Label>
              <Input
                id="join_code"
                name="code"
                type="text"
                autoComplete="off"
                placeholder="e.g. A1B2C-D3E4F"
                className="mt-1.5 font-mono uppercase tracking-wide"
              />
            </div>

            {joinState && !joinState.ok ? (
              <Notice tone="danger" role="alert">
                {joinState.message}
              </Notice>
            ) : null}

            {joinState?.ok ? (
              <Notice tone="success" role="status">
                {joinState.message}
              </Notice>
            ) : null}

            <Button type="submit" disabled={joinPending} className="w-full sm:w-auto">
              {joinPending ? "Linking…" : "Join this pair"}
            </Button>
          </form>
        </Card>
      </section>
    </div>
  );
}

function formatExpiry(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type PairedCardProps = {
  partnerLabel?: string | null;
  unpairState: UnpairKind;
  unpairAction: (payload: FormData) => void;
  unpairPending: boolean;
  unpairResult: UnpairToggleState | null;
};

function PairedCard({
  partnerLabel,
  unpairState,
  unpairAction,
  unpairPending,
  unpairResult,
}: PairedCardProps) {
  const partnerName = partnerLabel?.trim();
  const partner =
    partnerName && partnerName.length > 0 ? partnerName : "your partner";

  // After a successful dissolve the server revalidates and the card will
  // be replaced with the invite/join forms on the next render. Until then,
  // keep the local copy gentle.
  const dissolved = unpairResult?.ok && unpairResult.state === "dissolved";

  let headline = `Already paired with ${partner}`;
  let body =
    "Notes and devices you both have access to will show up across DeskNote.";
  let primaryLabel = "Unpair";
  let primaryVariant: "primary" | "secondary" | "ghost" = "ghost";
  let hint: string | null =
    "Unpairing needs both of you — when you tap Unpair, we wait for " +
    partner +
    " to confirm.";

  if (unpairState === "requested_by_me") {
    headline = `Waiting for ${partner} to confirm unpair`;
    body =
      "You asked to unpair. Nothing is undone yet — " +
      partner +
      " needs to confirm from their own DeskNote. You can cancel any time.";
    primaryLabel = "Cancel unpair request";
    primaryVariant = "secondary";
    hint = null;
  } else if (unpairState === "requested_by_partner") {
    headline = `${partner} asked to unpair`;
    body =
      "If you tap confirm, your pair dissolves immediately — notes and devices stop being shared. Nothing has changed yet.";
    primaryLabel = "Confirm unpair";
    primaryVariant = "primary";
    hint = "This cannot be undone once both of you confirm.";
  }

  return (
    <Card className="border-rose-100/80 bg-rose-50/40">
      <CardTitle>{headline}</CardTitle>
      <CardDescription className="mt-2">{body}</CardDescription>

      {unpairResult && !unpairResult.ok ? (
        <Notice tone="danger" role="alert" className="mt-5">
          {unpairResult.message}
        </Notice>
      ) : null}

      {unpairResult?.ok && !dissolved ? (
        <Notice tone="success" role="status" className="mt-5">
          {unpairResult.message}
        </Notice>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AppLink href="/dashboard" variant="primary">
          Back to your desk
        </AppLink>
        <AppLink href="/devices" variant="secondary">
          View devices
        </AppLink>

        <form action={unpairAction} className="ml-auto">
          <Button
            type="submit"
            size="sm"
            variant={primaryVariant}
            disabled={unpairPending || dissolved}
            className={
              unpairState === "none" || unpairState === "requested_by_me"
                ? "text-plum-400 hover:bg-blush-50"
                : undefined
            }
          >
            {unpairPending ? "Working…" : primaryLabel}
          </Button>
        </form>
      </div>

      {hint ? (
        <p className="mt-3 text-xs leading-relaxed text-plum-300">{hint}</p>
      ) : null}
    </Card>
  );
}
