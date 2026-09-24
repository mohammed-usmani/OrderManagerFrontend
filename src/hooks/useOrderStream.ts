"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "@/lib/api";

/**
 * Subscribe to the admin order-event stream (SSE). Calls `onEvent` whenever the
 * order board changes server-side, so the KDS updates in real time instead of
 * waiting for the poll. EventSource auto-reconnects; auth is the session
 * cookie (`withCredentials`). Only mount under AdminGuard (signed-in staff).
 */
export interface OrderStreamEvent {
  kind?: string;
  order_id?: string;
  status?: string;
  table_id?: string;
  table_label?: string;
  zone_name?: string;
}

export function useOrderStream(onEvent: (data?: OrderStreamEvent) => void) {
  const cbRef = useRef(onEvent);
  useEffect(() => { cbRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    const es = new EventSource(`${API_URL}/admin/orders/stream`, { withCredentials: true });
    es.onmessage = (e) => {
      let data: OrderStreamEvent | undefined;
      try { data = JSON.parse(e.data); } catch { data = undefined; }
      cbRef.current(data);
    };
    // onerror: EventSource reconnects on its own using the server's retry hint.
    return () => es.close();
  }, []);
}
