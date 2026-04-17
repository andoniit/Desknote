"use client";

import { useActionState } from "react";
import {
  createInviteAction,
  joinInviteAction,
  type CreateInviteState,
  type JoinInviteState,
} from "@/app/actions/relationship";
import { AppLink } from "@/components/ui/AppLink";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";

type Props = {
  fullyLinked: boolean;
  waitingForPartner: boolean;
  userEmail: string;
};

export function RelationshipSetupForms({
  fullyLinked,
  waitingForPartner,
  userEmail,
}: Props) {
  const [inviteState, inviteAction, invitePending] = useActionState(
    createInviteAction,
    null as CreateInviteState | null
  );
  const [joinState, joinAction, joinPending] = useActionState(
    joinInviteAction,
    null as JoinInviteState | null
  );

  if (fullyLinked) {
    return (
      <Card className="border-rose-100/80 bg-rose-50/40">
        <CardTitle>Your pair is active</CardTitle>
        <CardDescription className="mt-2">
          You are linked with your partner. Notes and devices you both have access to
          will show up across DeskNote.
        </CardDescription>
        <div className="mt-6 flex flex-wrap gap-3">
          <AppLink href="/dashboard" variant="primary">
            Back to your desk
          </AppLink>
          <AppLink href="/devices" variant="secondary">
            View devices
          </AppLink>
        </div>
      </Card>
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
