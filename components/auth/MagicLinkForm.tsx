"use client";

import { useFormStatus } from "react-dom";
import { requestMagicLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Sending link…" : "Email me a magic link"}
    </Button>
  );
}

export function MagicLinkForm({ defaultNext }: { defaultNext: string }) {
  const next =
    defaultNext.startsWith("/") && !defaultNext.startsWith("//")
      ? defaultNext
      : "/dashboard";

  return (
    <form action={requestMagicLink} className="space-y-5">
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
          className="text-base md:text-sm"
        />
      </div>
      <SubmitButton />
      <p className="text-center text-xs leading-relaxed text-plum-300">
        We&apos;ll email you a secure link. No password to remember.
      </p>
    </form>
  );
}
