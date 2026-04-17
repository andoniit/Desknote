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

export function EmailPinForm({ defaultNext }: { defaultNext: string }) {
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
          New here? Enter the email you want and choose a PIN — we&apos;ll create your account.
          Returning? Same email and the PIN you set before.
        </p>
      </div>
      <SubmitButton />
      <p className="text-center text-xs leading-relaxed text-plum-300">
        Your PIN is stored like a password (encrypted by Supabase). Only use digits 0–9.
      </p>
    </form>
  );
}
