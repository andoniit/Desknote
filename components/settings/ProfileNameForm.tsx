"use client";

import { useActionState } from "react";
import {
  updateDisplayNameAction,
  type UpdateDisplayNameState,
} from "@/app/actions/profile";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile/display-name";

type Props = {
  currentName: string | null;
};

export function ProfileNameForm({ currentName }: Props) {
  const [state, formAction, pending] = useActionState(
    updateDisplayNameAction,
    null as UpdateDisplayNameState | null
  );

  const liveName =
    state?.ok && state.displayName !== undefined
      ? state.displayName
      : currentName;

  return (
    <Card>
      <CardTitle>Your name</CardTitle>
      <CardDescription>
        {liveName
          ? `Your partner will see you as “${liveName}”.`
          : "Add a name so your partner sees who they’re paired with — a first name is perfect."}
      </CardDescription>

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="profile_display_name">Display name</Label>
          <Input
            id="profile_display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            defaultValue={currentName ?? ""}
            placeholder="e.g. Andon"
            className="mt-1.5 text-base md:text-sm"
            disabled={pending}
          />
          <p className="mt-2 text-xs leading-relaxed text-plum-200">
            Leave blank to clear. Up to {DISPLAY_NAME_MAX_LENGTH} characters.
          </p>
        </div>

        {state && !state.ok ? (
          <Notice tone="danger" role="alert">
            {state.message}
          </Notice>
        ) : null}

        {state?.ok ? (
          <Notice tone="success" role="status">
            {state.message}
          </Notice>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Save name"}
        </Button>
      </form>
    </Card>
  );
}
