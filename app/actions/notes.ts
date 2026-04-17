"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { resolvePartnerUserId } from "@/lib/relationship/partner";
import { createClient } from "@/utils/supabase/server";

const MAX_BODY = 140;

export type DeskNoteTarget = "my_desk" | "partner_desk" | "both";

export async function sendNote({ body }: { body: string }) {
  return sendNoteToDesks({ body, target: "partner_desk" });
}

export async function sendNoteToDesks({
  body,
  target,
}: {
  body: string;
  target: DeskNoteTarget;
}) {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };
  if (trimmed.length > MAX_BODY) {
    return { error: `Keep it under ${MAX_BODY} characters.` };
  }

  if (target !== "my_desk" && target !== "partner_desk" && target !== "both") {
    return { error: "Choose where to send your note." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You're not signed in." };

  const partnerId = await resolvePartnerUserId(supabase, user.id);

  if ((target === "partner_desk" || target === "both") && !partnerId) {
    return {
      error:
        "Link with your partner first to send to their desk — open Pair in the menu.",
    };
  }

  const rows =
    target === "my_desk"
      ? [
          {
            sender_id: user.id,
            recipient_id: user.id,
            body: trimmed,
            status: "queued" as const,
          },
        ]
      : target === "partner_desk"
        ? [
            {
              sender_id: user.id,
              recipient_id: partnerId!,
              body: trimmed,
              status: "queued" as const,
            },
          ]
        : [
            {
              sender_id: user.id,
              recipient_id: partnerId!,
              body: trimmed,
              status: "queued" as const,
            },
            {
              sender_id: user.id,
              recipient_id: user.id,
              body: trimmed,
              status: "queued" as const,
            },
          ];

  const { error } = await supabase.from("notes").insert(rows);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markNoteSeen(id: string) {
  const supabase = createClient(await cookies());
  const { error } = await supabase
    .from("notes")
    .update({ status: "seen" })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
