import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DeskMessageType, MessageHistoryEntry, MessageHistoryFilter } from "@/types/messages";
import { MESSAGE_HISTORY_PAGE_SIZE } from "@/lib/messages/history-filters";

type Client = SupabaseClient<Database>;

function isNoteStatus(v: string | undefined | null): v is MessageHistoryEntry["note_status"] {
  return v === "queued" || v === "delivered" || v === "seen";
}

const MESSAGE_SELECT =
  "id, from_user_id, to_device_id, content, message_type, is_pinned, created_at, note_id";

type Row = {
  id: string;
  from_user_id: string;
  to_device_id: string;
  content: string;
  message_type: string | null;
  is_pinned: boolean;
  created_at: string;
  note_id: string | null;
};

export type MessageHistoryPageResult = {
  entries: MessageHistoryEntry[];
  page: number;
  perPage: number;
  totalCount: number;
  pageCount: number;
};

/**
 * One page of message history (default 10 per page) with total count for pagination.
 */
export async function fetchMessageHistoryPage(
  supabase: Client,
  viewerUserId: string,
  pairedDeviceIds: string[],
  myDeskDeviceIds: string[],
  filter: MessageHistoryFilter,
  page: number,
  perPage: number = MESSAGE_HISTORY_PAGE_SIZE
): Promise<MessageHistoryPageResult> {
  if (filter === "desk" && !myDeskDeviceIds.length) {
    return { entries: [], page: 1, perPage, totalCount: 0, pageCount: 1 };
  }

  let countQ = supabase.from("messages").select("id", { count: "exact", head: true });
  let dataQ = supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .order("created_at", { ascending: false });

  if (filter === "sent") {
    countQ = countQ.eq("from_user_id", viewerUserId);
    dataQ = dataQ.eq("from_user_id", viewerUserId);
  } else if (filter === "desk") {
    countQ = countQ.in("to_device_id", myDeskDeviceIds);
    dataQ = dataQ.in("to_device_id", myDeskDeviceIds);
  } else if (pairedDeviceIds.length) {
    const orExpr = `from_user_id.eq.${viewerUserId},to_device_id.in.(${pairedDeviceIds.join(",")})`;
    countQ = countQ.or(orExpr);
    dataQ = dataQ.or(orExpr);
  } else {
    countQ = countQ.eq("from_user_id", viewerUserId);
    dataQ = dataQ.eq("from_user_id", viewerUserId);
  }

  const fromIdx = (page - 1) * perPage;
  const toIdx = fromIdx + perPage - 1;
  const pagedQ = dataQ.range(fromIdx, toIdx);

  const [{ count: countRaw, error: countError }, { data: rows, error: dataError }] =
    await Promise.all([countQ, pagedQ]);

  const totalCount = countError ? 0 : (countRaw ?? 0);
  const pageCount =
    totalCount === 0 ? 1 : Math.max(1, Math.ceil(totalCount / perPage));

  if (dataError) {
    return { entries: [], page, perPage, totalCount, pageCount };
  }

  if (!rows?.length) {
    return { entries: [], page, perPage, totalCount, pageCount };
  }

  return {
    entries: await rowsToEntries(supabase, rows as Row[], viewerUserId),
    page,
    perPage,
    totalCount,
    pageCount,
  };
}

async function rowsToEntries(
  supabase: Client,
  rows: Row[],
  viewerUserId: string
): Promise<MessageHistoryEntry[]> {
  const noteIds = [...new Set(rows.map((r) => r.note_id).filter((id): id is string => !!id))];
  const statusByNoteId = new Map<string, string>();

  if (noteIds.length) {
    const { data: notes } = await supabase.from("notes").select("id, status").in("id", noteIds);
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
