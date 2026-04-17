import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DeskMessageType, MessageHistoryEntry, MessageHistoryFilter } from "@/types/messages";

type Client = SupabaseClient<Database>;

function isNoteStatus(v: string | undefined | null): v is MessageHistoryEntry["note_status"] {
  return v === "queued" || v === "delivered" || v === "seen";
}

/**
 * Latest 20 messages for the dashboard history section, with optional filter.
 */
export async function fetchMessageHistory(
  supabase: Client,
  viewerUserId: string,
  pairedDeviceIds: string[],
  myDeskDeviceIds: string[],
  filter: MessageHistoryFilter
): Promise<MessageHistoryEntry[]> {
  let q = supabase
    .from("messages")
    .select(
      "id, from_user_id, to_device_id, content, message_type, is_pinned, created_at, note_id"
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (filter === "sent") {
    q = q.eq("from_user_id", viewerUserId);
  } else if (filter === "desk") {
    if (!myDeskDeviceIds.length) {
      return [];
    }
    q = q.in("to_device_id", myDeskDeviceIds);
  } else if (pairedDeviceIds.length) {
    q = q.or(
      `from_user_id.eq.${viewerUserId},to_device_id.in.(${pairedDeviceIds.join(",")})`
    );
  } else {
    q = q.eq("from_user_id", viewerUserId);
  }

  const { data: rows, error } = await q;

  if (error || !rows?.length) {
    return [];
  }

  const noteIds = [
    ...new Set(rows.map((r) => r.note_id).filter((id): id is string => !!id)),
  ];
  const statusByNoteId = new Map<string, string>();

  if (noteIds.length) {
    const { data: notes } = await supabase
      .from("notes")
      .select("id, status")
      .in("id", noteIds);

    for (const n of notes ?? []) {
      if (n.id && n.status) statusByNoteId.set(n.id, n.status as string);
    }
  }

  const senderIds = [...new Set(rows.map((r) => r.from_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", senderIds);

  const displayByUser = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name as string | null])
  );

  return rows.map((r) => {
    const rawStatus = r.note_id ? statusByNoteId.get(r.note_id) : null;
    const note_status = isNoteStatus(rawStatus) ? rawStatus : null;

    const sender_label =
      r.from_user_id === viewerUserId
        ? "You"
        : displayByUser.get(r.from_user_id)?.trim() || "Your partner";

    return {
      id: r.id,
      from_user_id: r.from_user_id,
      to_device_id: r.to_device_id,
      content: r.content,
      message_type: (r.message_type ?? "standard") as DeskMessageType,
      is_pinned: !!r.is_pinned,
      created_at: r.created_at,
      note_status,
      sender_label,
      device_name: "",
    };
  });
}

export function attachDeviceNames(
  entries: MessageHistoryEntry[],
  nameByDeviceId: Map<string, string>
): MessageHistoryEntry[] {
  return entries.map((e) => ({
    ...e,
    device_name: nameByDeviceId.get(e.to_device_id) ?? "Desk",
  }));
}
