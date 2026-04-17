# Saffron & Smoke — Client

Voice-first ordering experience for **Saffron & Smoke**, a modern Indian restaurant in Bandra West, Mumbai. Customers talk to Arjun (the AI front-of-house manager); the app renders menu, cart, and order cards on a live "canvas" as the conversation happens.

> Companion backend lives in `../server/`.

---

## What's in the box

### Customer
- **Landing** (`/`) — hero + feature strip.
- **Auth** (`/auth/signin`, `/auth/signup`) — JWT stored in `localStorage`.
- **Chat** (`/chat`) — the heart of the app. Big mic, idle state with "try saying" suggestion chips, and a canvas that mirrors what the agent just did (menu cards, cart, order confirmation…). Tap-to-add buttons on every dish card as a voice-free fallback.
- **Orders** (`/orders`, `/orders/[id]/confirmation`) — history + a proper Indian-restaurant tax invoice that prints as a clean A5 PDF (CGST/SGST split, amount-in-words, GSTIN/FSSAI header).
- **Profile** (`/profile`) — tiny; sign out lives here on mobile.

### Admin (separate visual language: **light chrome, data-dense**)
- **Dashboard** (`/admin`) — range picker, revenue (sub-total + with-charges), orders-by-status tiles, top-selling dishes table. Auto-refresh.
- **Kitchen** (`/admin/orders`) — live orders table with filters, search, sort, expandable rows, bulk mark-paid / cancel. 15-second polling.
- **Menu** (`/admin/menu`) — full catalog grid. Search, category filter, availability filter, sortable columns, inline cell editing, bulk enable/disable, and an Add-item modal.

Admins are bounced away from customer routes (`/chat`, `/orders`) into `/admin/*`.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 |
| Language | TypeScript (strict) |
| Styling | **Tailwind CSS v4** (native `@theme`) |
| Voice I/O | Browser Web Audio API (mic) + WebSocket to the server |
| Frame protocol | Hand-rolled protobuf decoder for Pipecat frames (`lib/proto.ts`) |
| State | React Context (Auth, VoiceAgent) — no Redux, no fetch library |

---

## Project layout

```
client/src/
├── app/
│   ├── layout.tsx                 root shell + AuthProvider + VoiceAgentProvider
│   ├── globals.css                tokens + print-only media queries
│   ├── page.tsx                   landing
│   ├── auth/signin, auth/signup   auth forms
│   ├── chat/                      customer voice experience
│   ├── orders/                    order list + receipt
│   ├── profile/
│   └── admin/                     back-office (light theme)
│       ├── page.tsx               dashboard
│       ├── orders/page.tsx        kitchen
│       └── menu/page.tsx          CRUD
│
├── components/
│   ├── AppShell.tsx               desktop sidebar + mobile bottom-nav frame
│   ├── Sidebar.tsx                nav (switches by user role)
│   ├── BottomNav.tsx              mobile nav (switches by role)
│   ├── Canvas.tsx                 renders UI events (menu / cart / orders / confirmation)
│   ├── Receipt.tsx                print-only Indian GST invoice
│   └── admin/
│       ├── AdminShell.tsx         light-theme wrapper
│       ├── PageHeader.tsx         sticky header w/ quick actions
│       └── ui.tsx                 Button, Input, Select, Card, Modal, StatusChip, Toolbar
│
├── contexts/
│   ├── AuthContext.tsx            JWT decode + login/register/logout
│   └── VoiceAgentContext.tsx      WebSocket, mic, audio player, canvas state,
│                                  ui_event dispatcher — persists across routes
│
└── lib/
    ├── api.ts                     typed REST client (apiFetch + domain helpers)
    ├── audio.ts                   startMicCapture, createAudioPlayer
    ├── proto.ts                   Pipecat protobuf encode/decode
    ├── datetime.ts                parse UTC, format in user's tz
    ├── brand.ts                   restaurant identity (name, address, GSTIN, …)
    └── amount-in-words.ts         Indian-numbering number-to-words for the bill
```

---

## Setup

```bash
# From client/
npm install

# Point the app at your backend
cp .env.example .env.local          # or create it
cat >> .env.local <<EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
EOF

npm run dev
# → http://localhost:3000
```

---

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | REST base |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws` | voice WS |
| `NEXT_PUBLIC_SHOW_WAKE_UP_GATE` | `0` | Set to `1` while the backend runs on Render's free plan. Shows a full-screen countdown until `GET /health` responds so users aren't staring at errors during the ~50 s cold-start. Remove the flag (or the entire `BackendStatusGate` component) once the backend is on an always-on plan. |

All three are read client-side; change them and restart `next dev` to pick up.

---

## How the voice loop works

1. User taps the mic. `VoiceAgentContext.toggleVoice()` asks the server for a short-lived Redis ticket (`POST /auth/ws-ticket` — JWT required, also sends the IANA timezone).
2. The client opens `ws://.../ws?ticket=…`, captures mic audio at 16 kHz mono via the Web Audio API, and streams PCM frames encoded as `AudioRawFrame` protobufs.
3. The server runs the Pipecat pipeline (STT → LLM + tools → TTS) and sends back:
   - **Audio frames** (PCM 24 kHz mono) — queued + played through `createAudioPlayer`.
   - **Transcription frames** — user speech transcripts.
   - **Text frames** — assistant speech transcripts.
   - **MessageFrame JSON** carrying `{ kind: "ui_event", event, data }` — dispatched into the `canvas` state so cards render.
4. Tapping the mic again ends the entire session (stops mic, closes WS, clears audio).

The provider lives at the app root, so the WebSocket and canvas state survive route navigation — you can pop over to `/orders` and come back without losing the call.

---

## Print-only receipt

The "Download Bill (PDF)" button on the confirmation page uses the browser's native print → **Save as PDF**. `Receipt.tsx` renders an Indian tax-invoice layout styled for A5 portrait; `globals.css` has a `@media print` rule that hides everything except `.receipt-print-area` so nothing but the bill makes it onto paper. No PDF library required.

---

## Dev tips

- Voice needs HTTPS or `localhost`. Chrome mutes `getUserMedia` otherwise.
- Safari's WebSocket `binaryType = "arraybuffer"` works, but audio playback uses `AudioContext` — tap-to-start gestures are enforced.
- Admin bill fields (service charge, GST) come from the **server** — never compute them client-side. `lib/brand.ts` is display-only now.
- If you change the voice agent's tool schemas on the backend, also bump the matching TypeScript types in `contexts/VoiceAgentContext.tsx` (the `CanvasState` union).
- Tailwind v4 sometimes nags you with "class X can be written as Y" diagnostics — they're style suggestions, not errors. The existing codebase uses the `[…]` arbitrary-value syntax consistently; match the surrounding convention.
