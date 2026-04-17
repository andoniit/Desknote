/** Stored in `public.messages.message_type` */
export type DeskMessageType = "standard" | "quick_send" | "system";

/** Row shape for `public.messages` (PostgREST / Supabase). */
export type DeskMessageRow = {
  id: string;
  from_user_id: string;
  to_device_id: string;
  content: string;
  message_type: DeskMessageType;
  is_pinned: boolean;
  created_at: string;
  note_id?: string | null;
};

/** Fields the app may send on insert (`created_at` is server-default). */
export type DeskMessageInsert = {
  from_user_id: string;
  to_device_id: string;
  content: string;
  message_type: DeskMessageType;
  is_pinned: boolean;
  note_id?: string | null;
};

/** Feed item after joining device for display. */
export type DeskMessageFeedItem = DeskMessageRow & {
  device_name: string | null;
  device_owner_id: string | null;
  direction: "outgoing" | "incoming";
};

export type NoteDeliveryStatus = "queued" | "delivered" | "seen";

export const MESSAGE_HISTORY_FILTERS = ["all", "sent", "desk"] as const;
export type MessageHistoryFilter = (typeof MESSAGE_HISTORY_FILTERS)[number];

/** One row for the history / recent list UI. */
export type MessageHistoryEntry = {
  id: string;
  from_user_id: string;
  to_device_id: string;
  content: string;
  message_type: DeskMessageType;
  is_pinned: boolean;
  created_at: string;
  sender_label: string;
  device_name: string;
  note_status: NoteDeliveryStatus | null;
};
