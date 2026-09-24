import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Same env the client bundle inlines (src/lib/config.ts fails the build when
// these are missing in production); the fallbacks only matter for `next dev`.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;
const wsOrigin = new URL(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws").origin;
const apiWsOrigin = apiOrigin.replace(/^http/, "ws"); // http→ws, https→wss

const connectSrc = [
  "'self'",
  ...new Set([apiOrigin, apiWsOrigin, wsOrigin]),
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
].join(" ");

// Static CSP (no nonces): Next's inline bootstrap scripts need 'unsafe-inline'
// — the documented "Without Nonces" setup. React needs 'unsafe-eval' in dev only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${connectSrc}`,
  "media-src 'self' blob:",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.razorpay.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
