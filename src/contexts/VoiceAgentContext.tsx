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

export interface CustomerCard {
  id: string;
  code: string;
  name: string | null;
  phone: string | null;
  address_line: string | null;
  area: string | null;
  pincode: string | null;
  landmark: string | null;
  preferences: string | null;
  allergies: string | null;
  order_count: number;
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
  | { kind: "customer_card"; customer: CustomerCard }
  | {
      kind: "delivery_check";
      query: string;
      serviceable: boolean;
      matched: string | null;
    }
  | { kind: "session_end"; reason: string; message?: string };

// --- Context -----------------------------------------------------------

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

/**
 * Stable per-browser id for session-based rate limiting (so different people
 * never block each other, but one browser can't open many concurrent calls).
 * Persisted in localStorage; shared across tabs of the same browser profile.
 */
function getClientId(): string {
  try {
    let id = localStorage.getItem("voiceClientId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("voiceClientId", id);
    }
    return id;
  } catch {
    return crypto.randomUUID(); // ephemeral fallback (private mode / no storage)
  }
}

interface VoiceAgentContextValue {
  status: AgentStatus;
  transcript: TranscriptEntry[];
  canvas: CanvasState;
  isVoiceActive: boolean;
  /** True while waiting in the queue for a free voice slot (all busy). */
  queued: boolean;
  /** Seconds left before the call's hard time cap, once the backend warns
   *  (~1 min out). null when not in the warning window. */
  warningSecondsLeft: number | null;
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
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Queue state: when all global slots are busy the server rejects with 4003
  // and we auto-retry until one frees up.
  const retryTimerRef = useRef<number | null>(null);
  const queueAttemptsRef = useRef(0);
  const queuedRef = useRef(false);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  const cancelQueue = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    queuedRef.current = false;
    queueAttemptsRef.current = 0;
    setQueued(false);
  }, []);

  // Close the shared AudioContext (capture + playback share one, created inside
  // the user's tap so iOS/Safari actually unlocks audio).
  const closeAudioContext = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const clearWarning = useCallback(() => {
    if (warnTimerRef.current !== null) {
      clearInterval(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    setWarningSecondsLeft(null);
  }, []);

  const startWarningCountdown = useCallback((seconds: number) => {
    if (warnTimerRef.current !== null) clearInterval(warnTimerRef.current);
    setWarningSecondsLeft(seconds);
    warnTimerRef.current = window.setInterval(() => {
      setWarningSecondsLeft((s) => {
        if (s === null) return null;
        if (s <= 1) {
          if (warnTimerRef.current !== null) {
            clearInterval(warnTimerRef.current);
            warnTimerRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

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
          closeAudioContext();
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
  }, [closeAudioContext]);

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
        case "customer_card": {
          setCanvas({ kind: "customer_card", customer: data as CustomerCard });
          break;
        }
        case "delivery_check": {
          const d = data as {
            query: string;
            serviceable: boolean;
            matched: string | null;
          };
          setCanvas({
            kind: "delivery_check",
            query: d.query,
            serviceable: d.serviceable,
            matched: d.matched,
          });
          break;
        }
        case "time_warning": {
          const secs = (data as { seconds_left?: number })?.seconds_left ?? 60;
          startWarningCountdown(secs);
          break;
        }
        case "session_end": {
          const d = (data as { reason?: string; message?: string }) ?? {};
          clearWarning();
          setCanvas({
            kind: "session_end",
            reason: d.reason ?? "goodbye",
            message: d.message,
          });
          scheduleEndAfterAudio();
          break;
        }
        default:
          // unknown event — ignore
          break;
      }
    },
    [scheduleEndAfterAudio, startWarningCountdown, clearWarning]
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
    clearWarning();
    cancelQueue();
    if (endTimerRef.current !== null) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    closeAudioContext();
    wsRef.current?.close();
    wsRef.current = null;
    setIsVoiceActive(false);
    setStatus("disconnected");
  }, [clearWarning, closeAudioContext, cancelQueue]);

  const startMic = useCallback(async (audioCtx: AudioContext) => {
    const mic = await startMicCapture((pcmChunk) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      // Half-duplex: while Arjun is speaking, DON'T send mic audio upstream.
      // Otherwise the speakers feed his own voice back into the mic, Gemini
      // hears itself, the turn never ends, and he talks over himself in a loop.
      // (Browser echo-cancellation isn't reliable across devices/speakers.)
      const botSpeaking = (playerRef.current?.timeRemaining() ?? 0) > 0.12;
      if (botSpeaking) return;
      wsRef.current.send(encodeAudioFrame(pcmChunk, 16000, 1));
    }, audioCtx);
    micRef.current = mic;
    setIsVoiceActive(true);
    setStatus("listening");
  }, []);

  // Opens a connection attempt (used for the initial tap and for queue retries).
  const connect = useCallback(async () => {
    setStatus("connecting");

    // Create + resume the AudioContext NOW, synchronously inside the tap
    // gesture — iOS/Safari only unlock audio this way. Reused for capture and
    // playback. (Doing this later, in ws.onopen, leaves it muted on mobile.)
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new Ctx();
      audioCtx.resume().catch(() => {});
      audioCtxRef.current = audioCtx;
    } catch {
      setCanvas({
        kind: "session_end",
        reason: "mic_error",
        message: "This browser can't play audio. Try Chrome or Safari directly.",
      });
      setStatus("disconnected");
      return;
    }

    // The voice line is public — fetch an anonymous ws-ticket (token is only
    // present for logged-in staff). The backend requires a ticket but no auth.
    let wsUrl = WS_URL;
    try {
      const { ticket } = await api.getWsTicket(token ?? undefined, getUserTimezone());
      wsUrl = `${WS_URL}?ticket=${ticket}&cid=${encodeURIComponent(getClientId())}`;
    } catch {
      closeAudioContext();
      setStatus("disconnected");
      return;
    }

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = async () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      try {
        playerRef.current = createAudioPlayer(ctx, 24000);
        await startMic(ctx);
        cancelQueue(); // got a slot — clear any queue state
      } catch (err) {
        // Mic denied, no mic, or an in-app/webview browser that blocks getUserMedia.
        const name = (err as { name?: string })?.name;
        const message =
          name === "NotAllowedError" || name === "SecurityError"
            ? "Microphone access is needed to talk to Arjun. Tap the mic and choose Allow."
            : name === "NotFoundError"
              ? "No microphone found on this device."
              : "Couldn't access the mic. Open the link in Chrome or Safari (not inside another app).";
        setCanvas({ kind: "session_end", reason: "mic_error", message });
        disconnectVoice();
      }
    };
    ws.onmessage = handleMessage;
    ws.onclose = (event) => {
      clearWarning();
      setStatus("disconnected");
      setIsVoiceActive(false);
      micRef.current?.stop();
      micRef.current = null;
      playerRef.current?.stop();
      playerRef.current = null;
      closeAudioContext();
      wsRef.current = null;
      // 4003 = all global voice slots are busy. Queue: auto-retry until one
      // frees up (the Gemini free tier allows only a few concurrent sessions).
      if (event.code === 4003) {
        const MAX_RETRIES = 10;
        const DELAY_MS = 4000;
        if (queueAttemptsRef.current < MAX_RETRIES) {
          queueAttemptsRef.current += 1;
          queuedRef.current = true;
          setQueued(true);
          setStatus("connecting");
          setCanvas({
            kind: "session_end",
            reason: "busy",
            message:
              "All voice lines are busy right now — you're in the queue, we'll connect you the moment one frees up.",
          });
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            if (queuedRef.current) {
              queuedRef.current = false;
              setQueued(false);
              connectRef.current();
            }
          }, DELAY_MS);
        } else {
          cancelQueue();
          setCanvas({
            kind: "session_end",
            reason: "busy",
            message:
              "Still busy after a while — please try again in a few minutes.",
          });
        }
      }
    };
    ws.onerror = () => ws.close();
  }, [startMic, handleMessage, token, disconnectVoice, clearWarning, closeAudioContext, cancelQueue]);

  // Keep a stable ref so queue retries can re-invoke the latest connect().
  connectRef.current = connect;

  const toggleVoice = useCallback(async () => {
    // One control: tapping while a call is live (or while queued/connecting)
    // cancels everything. Tapping from idle starts a fresh attempt.
    if (isVoiceActive || wsRef.current || queuedRef.current || status === "connecting") {
      disconnectVoice();
      return;
    }
    queueAttemptsRef.current = 0;
    await connect();
  }, [isVoiceActive, status, disconnectVoice, connect]);

  useEffect(() => {
    return () => {
      if (endTimerRef.current !== null) {
        clearTimeout(endTimerRef.current);
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
      }
      wsRef.current?.close();
      micRef.current?.stop();
      playerRef.current?.stop();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const value: VoiceAgentContextValue = {
    status,
    transcript,
    canvas,
    isVoiceActive,
    queued,
    warningSecondsLeft,
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
