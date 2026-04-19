"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Props = {
  /**
   * Current viewer's user id. We subscribe broadly but also listen for
   * changes to the viewer's own row so we refresh the moment pairing
   * status flips on either side.
   */
  userId: string;
  /**
   * Viewer's current partner id (if any). Used to listen for the partner's
   * profile updates — e.g. they set or change their display name.
   */
  partnerId?: string | null;
};

/**
 * Tiny invisible component that subscribes to Supabase Realtime changes
 * on relationship + profile tables for the current pair and calls
 * `router.refresh()` whenever anything relevant changes. That re-runs
 * the server components on the page (paired card, dashboard callout,
 * settings hint, etc.) with fresh data — no manual state management.
 *
 * Realtime respects RLS, so only events the viewer is allowed to see
 * come through.
 */
export function RelationshipRealtime({ userId, partnerId }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase.channel(`desknote-pair-${userId}`);

    const refresh = () => router.refresh();

    // relationship_members: rows appear when the partner joins and
    // disappear on unpair. Listen to all events.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "relationship_members" },
      refresh
    );

    // relationships: captures unpair_requested_by / dissolve.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "relationships" },
      refresh
    );

    // profiles: refresh when the viewer's own row or the partner's row
    // changes (display_name, partner_id, etc.).
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${userId}`,
      },
      refresh
    );

    if (partnerId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${partnerId}`,
        },
        refresh
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, userId, partnerId]);

  return null;
}
