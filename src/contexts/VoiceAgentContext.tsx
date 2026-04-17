"use client";

/**
 * Voice agent provider (voice-only).
 *
 * Mounted at the root layout so its state (WebSocket, transcript, canvas)
 * survives navigation between pages. Text chat has been removed — voice is
 * the only way to interact with the agent.
 *
 * Alongside audio frames, the WS also carries `MessageFrame` JSON payloads of
 * the form `{ kind: "ui_event", event: ..., data: ... }` which drive the
 * visual canvas rendered next to the transcript.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { encodeAudioFrame, decodeFrame, type DecodedFrame } from "@/lib/proto";
import { startMicCapture, createAudioPlayer } from "@/lib/audio";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getUserTimezone } from "@/lib/datetime";

export type AgentStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking";

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

// --- Canvas (UI event) types -------------------------------------------

export interface MenuItemCard {
  id: string;
  name: string;
  description: string | null;
  taste_profile: string | null;
  how_its_made: string | null;
  category: string;
  price: number;
  currency: string;
  serving: string | null;
  dietary: string[];
  spice_level: string | null;
  popularity: number | null;
  image_url: string | null;
  available: boolean;
}

export interface OrderItemCard {
  id: string;
  menu_item_id: string;
  name: string;
  category: string | null;
  quantity: number;
  price_at_order: number;
  line_total: number;
  special_instructions: string | null;
}

export interface OrderBillCharge {
  label: string;
  rate: number;
  amount: number;
}

export interface OrderCard {
  id: string;
  status: string;
  created_at: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  items: OrderItemCard[];
  item_count: number;
  subtotal: number;
  charges: OrderBillCharge[];
  total: number; // subtotal + all charges
}

export type CanvasState =
  | { kind: "idle" }
  | { kind: "menu_results"; title: string; items: MenuItemCard[] }
  | { kind: "cart_view"; order: OrderCard }
  | {
      kind: "orders_list";
      title: string;
      orders: OrderCard[];
      counts: Record<string, number>;
    }
  | { kind: "order_confirmed"; order: OrderCard }
  | { kind: "session_end"; reason: string };

// --- Context -----------------------------------------------------------

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

interface VoiceAgentContextValue {
  status: AgentStatus;
  transcript: TranscriptEntry[];
  canvas: CanvasState;
  isVoiceActive: boolean;
  disconnectVoice: () => void;
  toggleVoice: () => Promise<void>;
  clearCanvas: () => void;
  /**
   * Used by tap-to-order flows (non-voice). Pushes the same cart_view
   * state the voice agent would emit after add_to_order.
   */
  setCartView: (order: OrderCard) => void;
}

const VoiceAgentContext = createContext<VoiceAgentContextValue | null>(null);

interface UIEventMessage {
  kind: "ui_event";
  event: string;
  data: unknown;
}

function isUIEvent(x: unknown): x is UIEventMessage {
  return (
    typeof x === "object" &&
    x !== null &&
    "kind" in x &&
    (x as { kind: unknown }).kind === "ui_event"
  );
}

export function VoiceAgentProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<AgentStatus>("disconnected");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "idle" });
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const addTranscript = useCallback(
    (role: "user" | "assistant", text: string) => {
      setTranscript((prev) => [...prev, { role, text, timestamp: new Date() }]);
    },
    []
  );

  const clearCanvas = useCallback(() => setCanvas({ kind: "idle" }), []);
  const setCartView = useCallback(
    (order: OrderCard) => setCanvas({ kind: "cart_view", order }),
    []
  );

  // Reset state on logout.
  useEffect(() => {
    if (!isAuthenticated) {
      setTranscript([]);
      setCanvas({ kind: "idle" });
    }
  }, [isAuthenticated]);

  // --- Incoming frame handler ------------------------------------------

  const scheduleEndAfterAudio = useCallback(() => {
    // Clear any previous pending timer.
    if (endTimerRef.current !== null) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }

    const GRACE_MS = 400; // small pause after audio finishes, feels natural
    const POLL_MS = 250;
    const MAX_WAIT_MS = 15000; // hard cap: never hold the mic open >15s waiting
    const started = Date.now();

    const tick = () => {
      const remaining = playerRef.current?.timeRemaining() ?? 0;
      const waited = Date.now() - started;
      if (remaining <= 0 || waited >= MAX_WAIT_MS) {
        endTimerRef.current = window.setTimeout(() => {
          // Stop mic, close WS, clear state.
          micRef.current?.stop();
          micRef.current = null;
          playerRef.current?.stop();
          playerRef.current = null;
          wsRef.current?.close();
          wsRef.current = null;
          setIsVoiceActive(false);
          setStatus("disconnected");
        }, GRACE_MS);
        return;
      }
      endTimerRef.current = window.setTimeout(tick, POLL_MS);
    };
    tick();
  }, []);

  const handleUIEvent = useCallback(
    (event: string, data: unknown) => {
      switch (event) {
        case "menu_results": {
          const d = data as { title: string; items: MenuItemCard[] };
          setCanvas({ kind: "menu_results", title: d.title, items: d.items });
          break;
        }
        case "cart_view": {
          setCanvas({ kind: "cart_view", order: data as OrderCard });
          break;
        }
        case "orders_list": {
          const d = data as {
            title: string;
            orders: OrderCard[];
            counts: Record<string, number>;
          };
          setCanvas({
            kind: "orders_list",
            title: d.title,
            orders: d.orders,
            counts: d.counts,
          });
          break;
        }
        case "order_confirmed": {
          setCanvas({ kind: "order_confirmed", order: data as OrderCard });
          break;
        }
        case "session_end": {
          const reason = ((data as { reason?: string })?.reason) ?? "goodbye";
          setCanvas({ kind: "session_end", reason });
          scheduleEndAfterAudio();
          break;
        }
        default:
          // unknown event — ignore
          break;
      }
    },
    [scheduleEndAfterAudio]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const data = new Uint8Array(event.data);
      const frame: DecodedFrame = decodeFrame(data);

      if (frame.type === "audio") {
        setStatus((s) => (s !== "disconnected" ? "speaking" : s));
        playerRef.current?.play(frame.audio, frame.numChannels);
      } else if (frame.type === "text") {
        if (frame.text) addTranscript("assistant", frame.text);
        setStatus((s) => (s !== "disconnected" ? "listening" : s));
      } else if (frame.type === "transcription") {
        if (frame.text) addTranscript("user", frame.text);
      } else if (frame.type === "message") {
        if (isUIEvent(frame.data)) {
          handleUIEvent(frame.data.event, frame.data.data);
        }
      }
    },
    [addTranscript, handleUIEvent]
  );

  // --- Voice connection ------------------------------------------------

  const disconnectVoice = useCallback(() => {
    if (endTimerRef.current !== null) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setIsVoiceActive(false);
    setStatus("disconnected");
  }, []);

  const startMic = useCallback(async () => {
    const mic = await startMicCapture((pcmChunk) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const frame = encodeAudioFrame(pcmChunk, 16000, 1);
        wsRef.current.send(frame);
      }
    });
    micRef.current = mic;
    setIsVoiceActive(true);
    setStatus("listening");
  }, []);

  const toggleVoice = useCallback(async () => {
    // One control: tapping the mic while the call is live ends the whole
    // session (closes WS, stops mic + playback). Tapping from idle connects
    // and starts listening.
    if (isVoiceActive || wsRef.current) {
      disconnectVoice();
      return;
    }

    setStatus("connecting");

    let wsUrl = WS_URL;
    if (token) {
      try {
        const { ticket } = await api.getWsTicket(token, getUserTimezone());
        wsUrl = `${WS_URL}?ticket=${ticket}`;
      } catch {
        // server will reject if ticket is required
      }
    }

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = async () => {
      playerRef.current = createAudioPlayer(24000);
      await startMic();
    };
    ws.onmessage = handleMessage;
    ws.onclose = () => {
      setStatus("disconnected");
      setIsVoiceActive(false);
      micRef.current?.stop();
      micRef.current = null;
      playerRef.current?.stop();
      playerRef.current = null;
      wsRef.current = null;
    };
    ws.onerror = () => ws.close();
  }, [isVoiceActive, startMic, handleMessage, token, disconnectVoice]);

  useEffect(() => {
    return () => {
      if (endTimerRef.current !== null) {
        clearTimeout(endTimerRef.current);
      }
      wsRef.current?.close();
      micRef.current?.stop();
      playerRef.current?.stop();
    };
  }, []);

  const value: VoiceAgentContextValue = {
    status,
    transcript,
    canvas,
    isVoiceActive,
    disconnectVoice,
    toggleVoice,
    clearCanvas,
    setCartView,
  };

  return (
    <VoiceAgentContext.Provider value={value}>
      {children}
    </VoiceAgentContext.Provider>
  );
}

export function useVoiceAgent(): VoiceAgentContextValue {
  const ctx = useContext(VoiceAgentContext);
  if (!ctx) {
    throw new Error("useVoiceAgent must be used inside <VoiceAgentProvider>");
  }
  return ctx;
}
