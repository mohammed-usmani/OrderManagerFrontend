/**
 * Deploy-time URLs. NEXT_PUBLIC_* values are inlined at build time, so a
 * production build without them would silently call localhost — fail the
 * build (and the page load) loudly instead.
 */

const isProd = process.env.NODE_ENV === "production";

export function resolveUrl(
  value: string | undefined,
  name: string,
  devFallback: string,
  prod: boolean,
): string {
  if (!value) {
    if (prod) {
      throw new Error(
        `${name} is not set. It is inlined at build time, so set it in the build environment and rebuild.`,
      );
    }
    return devFallback;
  }
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`);
  }
  return value;
}

export const API_URL = resolveUrl(
  process.env.NEXT_PUBLIC_API_URL,
  "NEXT_PUBLIC_API_URL",
  "http://localhost:8000",
  isProd,
);

export const WS_URL = resolveUrl(
  process.env.NEXT_PUBLIC_WS_URL,
  "NEXT_PUBLIC_WS_URL",
  "ws://localhost:8000/ws",
  isProd,
);

/** Public origin guests reach the app on (baked into table QR codes). Falls
 *  back to the current origin only outside production, so printing cards from
 *  a preview URL can't produce QR codes that point at the preview. */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  if (isProd) throw new Error("NEXT_PUBLIC_SITE_URL is not set — can't build table QR links.");
  return window.location.origin;
}
