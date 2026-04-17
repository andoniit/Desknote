"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { sendNote } from "@/app/actions/notes";

const MAX = 140;

export function NoteComposer() {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setError(null);

    startTransition(async () => {
      const result = await sendNote({ body: body.trim() });
      if (result?.error) {
        setError(result.error);
      } else {
        setBody("");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-5 transition-shadow focus-within:shadow-soft"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX))}
        placeholder="Leave a little something on their desk…"
        aria-label="Note to your partner"
        disabled={isPending}
        className="border-0 bg-transparent p-0 text-lg focus:ring-0"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-plum-300">
          {body.length}/{MAX}
        </span>
        <Button type="submit" disabled={isPending || !body.trim()}>
          {isPending ? "Sending…" : "Send note"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
