import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchRoster } from "@/lib/api";
import type { RosterRow } from "@/lib/types";

/**
 * Loads the roster for an attendance session and keeps it fresh via Supabase
 * Realtime (INSERT on public.attendance) with a 5s polling fallback.
 */
export function useSessionRoster(sessionId: string | null) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const rows = await fetchRoster(sessionId);
      setRoster(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the class list.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setRoster([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`session-attendance-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `session_id=eq.${sessionId}` },
        () => void refresh(),
      )
      .subscribe();

    const poll = window.setInterval(() => void refresh(), 5000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, refresh]);

  const presentCount = roster.filter((r) => r.status !== "absent").length;

  return {
    roster,
    loading,
    error,
    refresh,
    presentCount,
    absentCount: roster.length - presentCount,
  };
}
