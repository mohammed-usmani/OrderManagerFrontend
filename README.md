# Saffron & Smoke — Client

Frontend for **Saffron & Smoke**, a modern Indian restaurant in Bandra West, Mumbai. Guests order by talking to **Arjun**, the AI host, while a live "canvas" shows the menu, cart and order as the conversation happens. Staff get a role-based back-office: kitchen display, floor and tables, billing, menu, analytics and settings.

> Companion backend lives in `../server/`.

---

## What's in the box

### Guests
- **Landing** (`/`) — "Spice Cosmos": a three.js WebGL backdrop behind an editorial layout. Signed-in staff are sent straight to their back-office home.
- **Voice line** (`/chat`) — the heart of the app. Tap the mic and talk; the canvas follows the agent (menu cards, customer card, delivery check, cart, confirmation, bill, order history). No account needed: the agent identifies parcel customers by a 4-digit code or phone number.
- **Dine-in** (`/t/[token]`) — the table's QR code opens this route, which resolves the table and sends the guest to `/chat` already seated. From there they can order by voice, **call a waiter**, **view the running tab**, and **pay from their phone** with Razorpay.
- **Orders** (`/orders`, `/orders/[id]/confirmation`) — order history and an Indian GST tax invoice that prints as a clean A5 PDF (CGST/SGST split, amount in words, GSTIN/FSSAI header). Requires sign-in.

### Staff back-office (`/admin/*`, light, data-dense theme)

Staff sign in at `/auth/signin`; each role sees only its pages (`lib/adminRoutes.ts`, enforced by `AdminGuard`).

| Page | What | Roles |
|---|---|---|
| `/admin` | Dashboard — revenue, orders by status, top dishes | owner, manager |
| `/admin/orders` | Kitchen display — live via SSE with a new-order chime; bump, void, cancel with reason, refund | all staff |
| `/admin/floor` | Floor map with live table status | owner, manager, cashier, waiter |
| `/admin/tables` | Tables and their QR codes | owner, manager, cashier, waiter |
| `/admin/menu` | Catalog, inline editing, 86 toggle and stock | owner, manager, chef |
| `/admin/analytics` | Trends, peak hours, dine-in vs parcel | owner, manager |
| `/admin/pricing` | Charge policy (service, AC, GST) | owner, manager |
| `/admin/customers` | Customer records | owner, manager, cashier |
| `/admin/service-areas` | Delivery areas | owner, manager |
| `/admin/staff` | Staff accounts and roles | owner, manager |
| `/admin/settings` | Restaurant profile and weekly hours | owner, manager |

Cashiers settle bills from a billing modal (cash or Razorpay) and print kitchen tickets. There's a ⌘K command palette and `G`-chord keyboard shortcuts throughout the back-office.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) + React 19 |
| Language | TypeScript (strict) |
| Styling | **Tailwind CSS v4** (native `@theme`) |
| Landing | three.js |
| Voice I/O | Web Audio API (16 kHz mic in, 24 kHz playback) + WebSocket |
| Frame protocol | Hand-rolled protobuf encoder/decoder for Pipecat frames (`lib/proto.ts`) |
| Live kitchen | Server-Sent Events (`hooks/useOrderStream.ts`) plus polling as a backstop |
| Payments | Razorpay Checkout (`lib/razorpay.ts`) |
| State | React Context (Auth, VoiceAgent) — no Redux, no fetch library |

> This Next.js version has breaking changes from older releases — see `AGENTS.md` before writing code.

---

## Project layout

```
client/src/
├── app/
│   ├── layout.tsx              root shell: AuthProvider, VoiceAgentProvider, BackendStatusGate
│   ├── page.tsx                landing
│   ├── chat/                   voice line (+ dine-in call-waiter / tab / pay)
│   ├── t/[token]/              dine-in QR entry
│   ├── orders/                 order history + printable invoice
│   ├── profile/
│   ├── auth/signin             staff and customer sign-in (signup redirects to /chat)
│   └── admin/                  back-office pages (see table above)
│
├── components/
│   ├── Canvas.tsx              renders the voice agent's UI events
│   ├── SpiceCosmos.tsx         three.js landing backdrop
│   ├── Receipt.tsx             print-only GST invoice
│   ├── BackendStatusGate.tsx   optional cold-start wait screen
│   ├── AppShell · Sidebar · BottomNav · ErrorBoundary
│   └── admin/                  AdminGuard, AdminShell, BillingModal, FloorCanvas,
│                               CommandPalette, keyboard shortcuts, ui primitives
│
├── contexts/
│   ├── AuthContext.tsx         signed-in user from GET /auth/me (session cookie)
│   └── VoiceAgentContext.tsx   ticket, WebSocket, mic, playback, canvas state,
│                               busy-line retry — survives route changes
│
├── hooks/                      useOrderStream (SSE), useAdminKeyboard, useFocusTrap
│
└── lib/
    ├── api.ts                  typed REST client
    ├── audio.ts                mic capture + audio player
    ├── proto.ts                Pipecat protobuf frames
    ├── adminRoutes.ts          back-office pages and their roles
    ├── razorpay.ts             Razorpay Checkout loader
    ├── datetime.ts · brand.ts · amount-in-words.ts
```

---

## Setup

```bash
# From client/
npm install

# Point the app at your backend
cat > .env.local <<EOF
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
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws` | voice WebSocket |
| `NEXT_PUBLIC_SHOW_WAKE_UP_GATE` | `0` | Set to `1` when the backend scales to zero (e.g. Cloud Run). Shows a full-screen countdown until `GET /health` responds, so users don't see errors during a cold start. |

All three are read client-side; restart `next dev` after changing them.

---

## Auth

Staff sign in with email and password; the server answers with an **httpOnly session cookie**, so the token never reaches JavaScript or `localStorage`. Every request is sent with `credentials: "include"`, the kitchen stream uses `EventSource` with `withCredentials`, and `AuthContext` learns who's signed in from `GET /auth/me`. The server only accepts cookie-authenticated writes from its configured frontend origins (`CORS_ORIGINS`), so the frontend and API must share a site in production — `order-manager.mohammedusmani.me` and `backend-saffron.mohammedusmani.me`. Locally, `localhost:3000` → `localhost:8000` works the same way.

## How the voice line works

1. The guest taps the mic. `VoiceAgentContext` asks the server for a short-lived ticket (`POST /auth/ws-ticket`). No login is needed. The ticket carries the guest's IANA timezone and, for dine-in, the table's QR token.
2. The client opens `ws://…/ws?ticket=…` and streams 16 kHz mono mic audio as Pipecat `AudioRawFrame` protobufs.
3. On the server, **Gemini Live** (native audio) listens and replies in speech, calling restaurant tools along the way. The client receives:
   - **Audio frames** (PCM 24 kHz mono), which are queued and played.
   - **Transcripts** of both sides.
   - **`{ kind: "ui_event", event, data }` messages**, which update the canvas: `menu_results`, `customer_card`, `delivery_check`, `cart_view`, `order_confirmed`, `bill_requested`, `orders_list`, `time_warning`, `session_end`.
4. If every voice line is busy, the server closes with code `4003` and the client retries automatically.
5. Calls are capped in length. The server sends `time_warning` a minute before the end, then `session_end`. Tapping the mic again ends the call.

The provider lives at the app root, so the call and the canvas survive navigation.

---

## Print-only receipt

"Download Bill (PDF)" uses the browser's native print → **Save as PDF**. `Receipt.tsx` renders an Indian tax-invoice layout for A5 portrait, and a `@media print` rule in `globals.css` hides everything except `.receipt-print-area`. No PDF library required.

---

## Dev tips

- Voice needs HTTPS or `localhost`; browsers block `getUserMedia` otherwise.
- Safari enforces a user gesture before audio can play — the mic tap covers it.
- Bill charges (service, AC, GST) always come from the **server**; never compute them client-side. `lib/brand.ts` is display-only.
- If a backend tool's UI event changes shape, update the matching types in `contexts/VoiceAgentContext.tsx` (the `CanvasState` union).
- Adding a back-office page? Register it in `lib/adminRoutes.ts` with its roles, so the nav, guard and command palette pick it up.
