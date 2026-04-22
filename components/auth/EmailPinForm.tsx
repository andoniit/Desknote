"use client";

import { useFormStatus } from "react-dom";
import { signInOrSignUpWithEmailPin } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Continue"}
    </Button>
  );
}

export function EmailPinForm({
  defaultNext,
  askName,
}: {
  defaultNext: string;
  askName: boolean;
}) {
  const next =
    defaultNext.startsWith("/") && !defaultNext.startsWith("//")
      ? defaultNext
      : "/dashboard";

  return (
    <form action={signInOrSignUpWithEmailPin} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="you@example.com"
          className="mt-1.5 text-base md:text-sm"
        />
      </div>
      {askName ? (
        <div>
          <Label htmlFor="display_name">
            Your name <span className="text-plum-200">(optional)</span>
          </Label>
          <Input
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            maxLength={40}
            placeholder="e.g. Andon"
            className="mt-1.5 text-base md:text-sm"
            aria-describedby="display_name_hint"
          />
          <p
            id="display_name_hint"
            className="mt-2 text-xs leading-relaxed text-plum-200"
          >
            New here? Add a first name so your partner sees who they&apos;re paired
            with. You can change it any time from Settings.
          </p>
        </div>
      ) : null}
      <div>
        <Label htmlFor="pin">Six-digit PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          minLength={6}
          maxLength={6}
          required
          placeholder="000000"
          className="mt-1.5 font-mono text-lg tracking-[0.35em] md:text-base"
          aria-describedby="pin_hint"
        />
        <p id="pin_hint" className="mt-2 text-xs leading-relaxed text-plum-200">
          {askName
            ? "New here? Enter the email you want and choose a PIN — we&apos;ll create your account. Returning? Same email and the PIN you set before."
            : "Enter the same email and the six-digit PIN you use for DeskNote."}
        </p>
      </div>
      <SubmitButton />
      <p className="text-center text-xs leading-relaxed text-plum-300">
        Your PIN is protected the same way a password is. Only use digits 0–9.
      </p>
    </form>
  );
}
