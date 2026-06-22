"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";

/**
 * Subscribe to the admin order-event stream (SSE). Calls `onEvent` whenever the
 * order board changes server-side, so the KDS updates in real time instead of
 * waiting for the poll. EventSource auto-reconnects; auth is via query token
 * because EventSource can't set an Authorization header.
 */
export function useOrderStream(token: string | null, onEvent: () => void) {
  const cbRef = useRef(onEvent);
  useEffect(() => { cbRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!token) return;
    const url = `${API_URL}/admin/orders/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onmessage = () => cbRef.current();
    // onerror: EventSource reconnects on its own using the server's retry hint.
    return () => es.close();
  }, [token]);
}
