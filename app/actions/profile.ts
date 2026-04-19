"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
} from "@/lib/profile/display-name";

export type UpdateDisplayNameState =
  | { ok: true; message: string; displayName: string | null }
  | { ok: false; message: string };

export async function updateDisplayNameAction(
  _prev: UpdateDisplayNameState | null,
  formData: FormData
): Promise<UpdateDisplayNameState> {
  const raw = String(formData.get("display_name") ?? "");
  const displayName = normalizeDisplayName(raw);

  if (raw.trim().length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      message: `Please keep it under ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Please sign in again and try once more." };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" });

  if (error) {
    console.error("[updateDisplayNameAction] failed:", error.message);
    return {
      ok: false,
      message: "We could not save your name just now. Please try again.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/relationship");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: displayName
      ? "Saved. Your partner will see this name."
      : "Cleared. You will appear as “your partner” until you add a name.",
    displayName,
  };
}
