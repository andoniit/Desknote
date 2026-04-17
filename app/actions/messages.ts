"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { fetchPairedDevicesForUser } from "@/lib/data/paired-devices";
import { isDeskMessageType, validateDeskMessageContent } from "@/lib/messages/validation";
import type { DeskMessageType } from "@/types/messages";
import { createClient } from "@/utils/supabase/server";

export type SendDeskMessagesResult =
  | { ok: true; sentCount: number; toast: string }
  | { ok: false; error: string };

export type SendDeskMessagesInput = {
  content: string;
  /** One device id, or multiple for “both desks” (each must be in your paired set). */
  toDeviceIds: string[];
  messageType?: DeskMessageType;
  isPinned?: boolean;
};

/**
 * Persists rows in `messages` and mirrors delivery rows into `notes` (existing ESP32 flow).
 * Inserts `notes` first, then `messages` with `note_id` so history can show seen / unseen from note status.
 */
export async function sendDeskMessages(
  input: SendDeskMessagesInput
): Promise<SendDeskMessagesResult> {
  const { toDeviceIds, messageType = "standard", isPinned: explicitPinned } = input;

  const parsed = validateDeskMessageContent(input.content);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  if (!toDeviceIds.length) {
    return { ok: false, error: "Pick at least one desk to send to." };
  }

  const uniqueIds = [...new Set(toDeviceIds)];
  if (uniqueIds.length > 8) {
    return { ok: false, error: "Too many destinations — try sending in smaller batches." };
  }

  if (!isDeskMessageType(messageType)) {
    return { ok: false, error: "That message type is not supported." };
  }

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You need to be signed in to send a message." };
  }

  const allowedDevices = await fetchPairedDevicesForUser(supabase, user.id);
  const allowed = new Set(allowedDevices.map((d) => d.id));

  for (const id of uniqueIds) {
    if (!allowed.has(id)) {
      return {
        ok: false,
        error: "One of those desks is not available on your account — refresh and try again.",
      };
    }
  }

  const deviceById = new Map(allowedDevices.map((d) => [d.id, d]));

  const noteRows = uniqueIds.map((deviceId) => {
    const dev = deviceById.get(deviceId)!;
    return {
      sender_id: user.id,
      recipient_id: dev.owner_id,
      body: parsed.value,
      status: "queued" as const,
      device_id: deviceId,
    };
  });

  const { data: insertedNotes, error: noteError } = await supabase
    .from("notes")
    .insert(noteRows)
    .select("id");

  if (noteError || !insertedNotes?.length) {
    return {
      ok: false,
      error:
        noteError?.message ??
        "We could not queue your message for the displays. Please try again.",
    };
  }

  if (insertedNotes.length !== uniqueIds.length) {
    const ids = insertedNotes.map((r) => r.id);
    if (ids.length) await supabase.from("notes").delete().in("id", ids);
    return { ok: false, error: "Something went wrong while saving. Please try again." };
  }

  const messageRows = uniqueIds.map((to_device_id, i) => {
    const dev = deviceById.get(to_device_id)!;
    const rowPinned =
      explicitPinned !== undefined ? explicitPinned : !!dev.pinned_mode_enabled;
    return {
      from_user_id: user.id,
      to_device_id,
      content: parsed.value,
      message_type: messageType,
      is_pinned: rowPinned,
      note_id: insertedNotes[i]!.id,
    };
  });

  const { error: msgError } = await supabase.from("messages").insert(messageRows);

  if (msgError) {
    const ids = insertedNotes.map((r) => r.id).filter(Boolean) as string[];
    if (ids.length) await supabase.from("notes").delete().in("id", ids);
    return {
      ok: false,
      error:
        msgError.message ||
        "Could not save your message. If this keeps happening, check that the messages table and note_id column exist in Supabase.",
    };
  }

  revalidatePath("/dashboard");

  const n = uniqueIds.length;
  const toast =
    n === 1
      ? "Sent to your desk."
      : `Sent to ${n} desks — they will see it when their display comes online.`;

  return { ok: true, sentCount: n, toast };
}
