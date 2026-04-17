"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const MAX_BODY = 140;

export async function sendNote({ body }: { body: string }) {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };
  if (trimmed.length > MAX_BODY) {
    return { error: `Keep it under ${MAX_BODY} characters.` };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You're not signed in." };

  // Figure out the partner for this user from their profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("partner_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.partner_id) {
    return {
      error:
        "Pair with your partner first — open Settings to link your accounts.",
    };
  }

  const { error } = await supabase.from("notes").insert({
    sender_id: user.id,
    recipient_id: profile.partner_id,
    body: trimmed,
    status: "queued",
  });

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
