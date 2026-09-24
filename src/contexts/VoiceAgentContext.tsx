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
import { WS_URL } from "@/lib/config";
import { isLinesBusy, queueRetryDelay } from "@/lib/backoff";

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
  | { kind: "bill_requested"; tableLabel?: string }
  | { kind: "session_end"; reason: string; message?: string };

/** Dine-in context when the call was opened from a table's QR (/t/<token>). */
export interface TableContext {
  token: string;
  label: string;
  zoneName: string | null;
  isAc: boolean;
}

// --- Context -----------------------------------------------------------

// Queue retries (3s → 20s backoff) before giving up: roughly 3–4 minutes.
const MAX_QUEUE_RETRIES = 12;

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

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// Adaptive half-duplex: barge-in (full-duplex) is ON by default. If the bot's
// own audio keeps getting transcribed as "user" speech while it's speaking
// (echo/feedback), we flip to half-duplex — mute the mic while the bot talks —
// for the rest of the call. ECHO_THRESHOLD overlaps within ECHO_WINDOW_MS trips it.
const ECHO_WINDOW_MS = 8000;
const ECHO_THRESHOLD = 4;

/** A clear, actionable message for a mic-permission failure. Distinguishes a
 *  hard block (browser won't re-prompt → must change site settings) from a
 *  first-time prompt the user can simply re-trigger by tapping again. */
async function micPermissionMessage(err: unknown): Promise<string> {
  const name = (err as { name?: string })?.name;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "I can't find a microphone on this device.";
  }
  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "PermissionDeniedError"
  ) {
    let blocked = false;
    try {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      blocked = status.state === "denied";
    } catch {
      /* Permissions API unavailable — fall back to the prompt message */
    }
    return blocked
      ? "Microphone is blocked for this site. Tap the lock / site-settings icon in the address bar, allow Microphone, then reload and try again."
      : "I need microphone access to take your order — tap the mic and choose Allow when your browser asks.";
  }
  return "Couldn't reach the microphone. Open this link directly in Chrome or Safari (not inside another app), then try again.";
}

interface VoiceAgentContextValue {
  status: AgentStatus;
  transcript: TranscriptEntry[];
  canvas: CanvasState;
  isVoiceActive: boolean;
  /** True while waiting in the queue for a free voice slot (all busy). */
  queued: boolean;
  /** True once echo was detected and we switched to half-duplex (barge-in off
   *  — the caller must wait for Arjun to finish before speaking). */
  echoSuppressed: boolean;
  /** Seconds left before the call's hard time cap, once the backend warns
   *  (~1 min out). null when not in the warning window. */
  warningSecondsLeft: number | null;
  disconnectVoice: () => void;
  toggleVoice: () => Promise<void>;
  /**
   * Used by tap-to-order flows (non-voice). Pushes the same cart_view
   * state the voice agent would emit after add_to_order.
   */
  setCartView: (order: OrderCard) => void;
  /** Dine-in table binding (set by the /t/<token> QR landing); null = parcel. */
  tableContext: TableContext | null;
  setTableContext: (ctx: TableContext | null) => void;
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
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<AgentStatus>("disconnected");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [canvas, setCanvas] = useState<CanvasState>({ kind: "idle" });
  const [tableContext, setTableContextState] = useState<TableContext | null>(null);

  // Rehydrate the dine-in table binding (set by /t/<token>) so a reload of
  // /chat keeps the call bound to the same table.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tableContext");
      if (raw) setTableContextState(JSON.parse(raw));
    } catch {
      /* no sessionStorage (private mode) — parcel mode */
    }
  }, []);

  const setTableContext = useCallback((ctx: TableContext | null) => {
    setTableContextState(ctx);
    try {
      if (ctx) sessionStorage.setItem("tableContext", JSON.stringify(ctx));
      else sessionStorage.removeItem("tableContext");
    } catch {
      /* ignore */
    }
  }, []);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const [echoSuppressed, setEchoSuppressed] = useState(false);
  // Half-duplex engages only after echo is detected (see ECHO_* constants).
  const halfDuplexRef = useRef(false);
  const echoTimesRef = useRef<number[]>([]);
  // Decays half-duplex back to full-duplex after a quiet window.
  const halfDuplexDecayRef = useRef<number | null>(null);
  // Guards the idempotent teardown() against re-entry.
  const tearingDownRef = useRef(false);
  // Each connect() attempt gets an id; teardown bumps it so an attempt still
  // awaiting the mic / ticket knows it was cancelled and cleans up after itself.
  const attemptRef = useRef(0);

  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const warnTimerRef = useRef<number | null>(null);
  // Fallback end if the backend's session_end is late after the countdown hits 0.
  const graceTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const stopMicStream = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

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
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    setWarningSecondsLeft(null);
  }, []);

  // Stop and release every media resource (mic, stream, player, AudioContext).
  // Safe to call repeatedly.
  const releaseMedia = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    stopMicStream();
    playerRef.current?.stop();
    playerRef.current = null;
    closeAudioContext();
  }, [stopMicStream, closeAudioContext]);

  // The single, idempotent call-teardown path. Every teardown route (manual
  // disconnect, post-audio end, unmount) funnels through here so they can't
  // drift apart. Guarded against re-entry so the ws.close() it triggers can't
  // recurse back in.
  const teardown = useCallback(() => {
    if (tearingDownRef.current) return;
    tearingDownRef.current = true;
    try {
      attemptRef.current++;
      clearWarning();
      cancelQueue();
      if (halfDuplexDecayRef.current !== null) {
        clearTimeout(halfDuplexDecayRef.current);
        halfDuplexDecayRef.current = null;
      }
      if (endTimerRef.current !== null) {
        clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
      releaseMedia();
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      setIsVoiceActive(false);
      setStatus("disconnected");
    } finally {
      tearingDownRef.current = false;
    }
  }, [clearWarning, cancelQueue, releaseMedia]);

  // Stable ref to the latest teardown so deferred timers (grace end, unmount)
  // can call it without being wired into every dependency array.
  const teardownRef = useRef(teardown);
  useEffect(() => { teardownRef.current = teardown; }, [teardown]);

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
          // "Wrapping up…" is shown at 0; if no session_end arrives within a
          // short grace, end the call ourselves so the mic can't hang open.
          if (graceTimerRef.current !== null) clearTimeout(graceTimerRef.current);
          graceTimerRef.current = window.setTimeout(() => {
            graceTimerRef.current = null;
            teardownRef.current();
          }, 8000);
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
        // Route the end through the shared idempotent teardown so it can't race
        // a manual disconnect / unmount.
        endTimerRef.current = window.setTimeout(() => { teardown(); }, GRACE_MS);
        return;
      }
      endTimerRef.current = window.setTimeout(tick, POLL_MS);
    };
    tick();
  }, [teardown]);

  const handleUIEvent = useCallback(
    (event: string, data: unknown) => {
      // Lightweight validation: the payloads come off the wire and are
      // dereferenced deeply by the canvas, so reject malformed frames here
      // (log + ignore) rather than letting them throw inside render.
      const isObj = (x: unknown): x is Record<string, unknown> =>
        typeof x === "object" && x !== null;
      const isOrder = (x: unknown): x is OrderCard =>
        isObj(x) && typeof x.id === "string" && Array.isArray(x.items) && typeof x.total === "number";
      const bad = (why: string) => console.warn(`[voice] ignoring ${event} ui_event: ${why}`);

      switch (event) {
        case "menu_results": {
          if (!isObj(data) || !Array.isArray((data as { items?: unknown }).items)) return bad("no items[]");
          const d = data as { title: string; items: MenuItemCard[] };
          setCanvas({ kind: "menu_results", title: d.title ?? "", items: d.items });
          break;
        }
        case "cart_view": {
          if (!isOrder(data)) return bad("not an order");
          setCanvas({ kind: "cart_view", order: data });
          break;
        }
        case "orders_list": {
          if (!isObj(data) || !Array.isArray((data as { orders?: unknown }).orders)) return bad("no orders[]");
          const d = data as {
            title: string;
            orders: OrderCard[];
            counts: Record<string, number>;
          };
          setCanvas({
            kind: "orders_list",
            title: d.title ?? "",
            orders: d.orders,
            counts: d.counts ?? {},
          });
          break;
        }
        case "order_confirmed": {
          if (!isOrder(data)) return bad("not an order");
          setCanvas({ kind: "order_confirmed", order: data });
          break;
        }
        case "customer_card": {
          if (!isObj(data) || typeof (data as { id?: unknown }).id !== "string") return bad("no customer id");
          setCanvas({ kind: "customer_card", customer: data as unknown as CustomerCard });
          break;
        }
        case "delivery_check": {
          if (!isObj(data)) return bad("not an object");
          const d = data as {
            query: string;
            serviceable: boolean;
            matched: string | null;
          };
          setCanvas({
            kind: "delivery_check",
            query: d.query ?? "",
            serviceable: !!d.serviceable,
            matched: d.matched ?? null,
          });
          break;
        }
        case "bill_requested": {
          const d = (isObj(data) ? data : {}) as { table_label?: string };
          setCanvas({ kind: "bill_requested", tableLabel: d.table_label });
          break;
        }
        case "time_warning": {
          const secs = (isObj(data) ? (data as { seconds_left?: number }).seconds_left : undefined) ?? 60;
          startWarningCountdown(secs);
          break;
        }
        case "session_end": {
          const d = (isObj(data) ? data : {}) as { reason?: string; message?: string };
          const reason = d.reason ?? "goodbye";
          clearWarning();
          // End-of-visit reasons clear the dine-in table binding so a later
          // parcel call can't inherit a stale table.
          if (/settle|bill|goodbye|paid/i.test(reason)) setTableContext(null);
          setCanvas({ kind: "session_end", reason, message: d.message });
          scheduleEndAfterAudio();
          break;
        }
        default:
          // unknown event — ignore
          break;
      }
    },
    [scheduleEndAfterAudio, startWarningCountdown, clearWarning, setTableContext]
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
        if (frame.text) {
          addTranscript("user", frame.text);
          // Echo guard: a "user" transcription arriving WHILE the bot is still
          // speaking usually means the mic is hearing the bot. Enough overlaps
          // in a short window → switch to half-duplex for the rest of the call.
          if (
            !halfDuplexRef.current &&
            (playerRef.current?.timeRemaining() ?? 0) > 0.3
          ) {
            const now = Date.now();
            const recent = echoTimesRef.current.filter(
              (t) => now - t < ECHO_WINDOW_MS
            );
            recent.push(now);
            echoTimesRef.current = recent;
            if (recent.length >= ECHO_THRESHOLD) {
              halfDuplexRef.current = true;
              setEchoSuppressed(true);
              // Decay back to full-duplex after a quiet window so a single noisy
              // stretch doesn't kill barge-in for the rest of the call.
              if (halfDuplexDecayRef.current !== null)
                clearTimeout(halfDuplexDecayRef.current);
              halfDuplexDecayRef.current = window.setTimeout(() => {
                halfDuplexRef.current = false;
                echoTimesRef.current = [];
                setEchoSuppressed(false);
                halfDuplexDecayRef.current = null;
              }, ECHO_WINDOW_MS * 2);
            }
          }
        }
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
    teardown();
  }, [teardown]);

  const startMic = useCallback(async (audioCtx: AudioContext, stream: MediaStream, ws: WebSocket) => {
    const mic = await startMicCapture((pcmChunk) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      // Full-duplex by default so barge-in works. Only once we've detected an
      // echo loop (halfDuplexRef) do we stop sending mic audio while the bot is
      // speaking — so it can't keep hearing itself.
      if (halfDuplexRef.current) {
        const botSpeaking = (playerRef.current?.timeRemaining() ?? 0) > 0.12;
        if (botSpeaking) return;
      }
      wsRef.current.send(encodeAudioFrame(pcmChunk, 16000, 1));
    }, audioCtx, stream);
    if (wsRef.current !== ws) {
      mic.stop(); // socket closed (e.g. busy line) while capture was starting
      return;
    }
    micRef.current = mic;
    setIsVoiceActive(true);
    setStatus("listening");
  }, []);

  // Opens a connection attempt (used for the initial tap and for queue retries).
  const connect = useCallback(async () => {
    const attempt = ++attemptRef.current;
    // True once this attempt was cancelled (teardown) or superseded.
    const stale = () => attemptRef.current !== attempt;
    const fail = (reason: string, message: string) => {
      teardown();
      setCanvas({ kind: "session_end", reason, message });
    };
    setStatus("connecting");
    // Clear any prior session_end / error screen so a fresh call starts clean
    // (but keep the queued "busy" message during a 4003 retry).
    if (!queuedRef.current) setCanvas({ kind: "idle" });
    // Each call starts in full-duplex (barge-in on); echo detection may flip it.
    halfDuplexRef.current = false;
    echoTimesRef.current = [];
    setEchoSuppressed(false);

    // Create + resume the AudioContext NOW, synchronously inside the tap
    // gesture — iOS/Safari only unlock audio this way. Reused for capture and
    // playback, and kept across queue retries (a retry runs outside any tap).
    try {
      let audioCtx = audioCtxRef.current;
      if (!audioCtx || audioCtx.state === "closed") {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new Ctx();
        audioCtxRef.current = audioCtx;
      }
      await audioCtx.resume().catch(() => {});
      if (stale()) return; // cancelled — teardown already closed the context
      if (audioCtx.state !== "running") {
        return fail(
          "mic_error",
          "Audio is blocked on this device. Check that it isn't muted / in silent mode, then tap the mic again.",
        );
      }
    } catch {
      return fail("mic_error", "This browser can't play audio. Try Chrome or Safari directly.");
    }

    // Ask for the microphone NOW, in the tap — so the permission prompt appears
    // immediately and a denial/block is handled BEFORE we use a connection slot
    // (no silent failure; the user gets a clear, actionable message + can retry).
    // Queue retries reuse the stream from the original tap.
    const haveMic = micStreamRef.current
      ?.getAudioTracks()
      .some((t) => t.readyState === "live");
    if (!haveMic) {
      if (!navigator.mediaDevices?.getUserMedia) {
        return fail(
          "mic_error",
          "This browser can't access the microphone. Open the link directly in Chrome or Safari.",
        );
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      } catch (err) {
        const message = await micPermissionMessage(err);
        if (!stale()) fail("mic_error", message);
        return;
      }
      if (stale()) {
        // Cancelled while the prompt was open — don't keep the mic live.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      micStreamRef.current = stream;
    }

    // The voice line is public — fetch a ws-ticket (the session cookie rides
    // along for logged-in staff). The backend requires a ticket but no auth.
    let wsUrl = WS_URL;
    // Dine-in calls carry the scanned table's token (sessionStorage is the
    // source of truth so a stale closure can't bind the wrong table).
    let tableToken: string | undefined;
    try {
      const raw = sessionStorage.getItem("tableContext");
      if (raw) tableToken = (JSON.parse(raw) as TableContext).token;
    } catch {
      /* ignore */
    }
    try {
      const { ticket } = await api.getWsTicket(getUserTimezone(), tableToken);
      wsUrl = `${WS_URL}?ticket=${ticket}&cid=${encodeURIComponent(getClientId())}`;
    } catch (err) {
      if (stale()) return;
      // fetch() rejects with a TypeError on network / CORS failures; HTTP
      // errors (429, 5xx) carry the server's message.
      return fail(
        "connection_error",
        err instanceof TypeError || !(err instanceof Error)
          ? "Couldn't reach the voice line. Check your connection and tap the mic to try again."
          : `Couldn't start the call: ${err.message}`,
      );
    }
    if (stale()) return; // cancelled while fetching the ticket — never open the socket

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = async () => {
      if (wsRef.current !== ws) return;
      const ctx = audioCtxRef.current;
      const stream = micStreamRef.current;
      if (!ctx || !stream) return;
      try {
        playerRef.current = createAudioPlayer(ctx, 24000);
        await startMic(ctx, stream, ws);
      } catch (err) {
        const message = await micPermissionMessage(err);
        if (wsRef.current === ws) fail("mic_error", message);
      }
    };
    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      // The server only talks once we hold a slot — the queue is over.
      if (queuedRef.current) {
        cancelQueue();
        setCanvas({ kind: "idle" });
      }
      handleMessage(event);
    };
    ws.onclose = (event) => {
      // A late close from a socket we already tore down / replaced must not
      // touch the current call.
      if (wsRef.current !== ws) return;
      wsRef.current = null;

      // 4003 = refused. "Lines busy" (global slots taken) is worth queueing
      // for; other 4003 refusals (per-IP / per-client limits) are not.
      const busy = event.code === 4003 && isLinesBusy(event.reason);
      if (busy && queueAttemptsRef.current < MAX_QUEUE_RETRIES) {
        // Keep the AudioContext + mic stream (unlocked by the user's tap) for
        // the retry; only stop capture and playback.
        micRef.current?.stop();
        micRef.current = null;
        playerRef.current?.stop();
        playerRef.current = null;
        setIsVoiceActive(false);
        const delay = queueRetryDelay(queueAttemptsRef.current);
        queueAttemptsRef.current += 1;
        queuedRef.current = true;
        setQueued(true);
        setStatus("connecting");
        setCanvas({
          kind: "session_end",
          reason: "busy",
          message: `${event.reason || "All voice lines are busy right now."} You're in the queue — we'll connect you the moment one frees up.`,
        });
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          // Only reconnect if we're still queued AND the user is actually on
          // the chat page and the tab is visible — otherwise drop the queue
          // (and the mic) so we don't hold it app-wide after they've left.
          const onChat = window.location.pathname.startsWith("/chat");
          const visible = document.visibilityState === "visible";
          if (queuedRef.current && onChat && visible) {
            connectRef.current();
          } else if (queuedRef.current) {
            fail("busy", "You left the queue. Tap the mic to try again.");
          }
        }, delay);
        return;
      }

      teardown();
      if (event.code === 4003) {
        setCanvas({
          kind: "session_end",
          reason: busy ? "busy" : "refused",
          message: busy
            ? "Still busy after a while — please try again in a few minutes."
            : event.reason,
        });
      } else if (event.code !== 1000) {
        // Dropped mid-call (1006), bad/expired ticket (4001), server error…
        // Keep a session_end the server already sent (e.g. goodbye).
        const message =
          event.code === 4001
            ? "The call couldn't be authorised. Tap the mic to try again."
            : "The call dropped. Check your connection and tap the mic to reconnect.";
        setCanvas((c) =>
          c.kind === "session_end" ? c : { kind: "session_end", reason: "connection_error", message },
        );
      }
    };
    ws.onerror = () => ws.close();
  }, [startMic, handleMessage, cancelQueue, teardown]);

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

  // Run the shared teardown exactly once on unmount.
  useEffect(() => {
    return () => { teardownRef.current(); };
  }, []);

  const value: VoiceAgentContextValue = {
    status,
    transcript,
    canvas,
    isVoiceActive,
    queued,
    echoSuppressed,
    warningSecondsLeft,
    disconnectVoice,
    toggleVoice,
    setCartView,
    tableContext,
    setTableContext,
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
