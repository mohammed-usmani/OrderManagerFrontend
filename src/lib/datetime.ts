/**
 * Date utilities.
 *
 * Backend emits naive UTC timestamps like "2026-04-17T17:49:28.392168" (no
 * timezone suffix). The browser's `new Date(iso)` would interpret that as
 * local time, which is wrong. We append `Z` so it's parsed as UTC, and let
 * `toLocaleDateString` / `toLocaleString` render in the user's local zone.
 */

function parseBackendIso(iso: string): Date {
  // If the string already has a timezone suffix (Z or +HH:MM), leave it alone.
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso)) {
    return new Date(iso);
  }
  return new Date(iso + "Z");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return parseBackendIso(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso);
}

/**
 * Returns a short human-readable age string (e.g. "3m", "1h 12m") from an
 * ISO timestamp to now. Used for KDS order-age display.
 */
export function formatAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - parseBackendIso(iso).getTime();
  if (ms < 0) return "just now";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Returns an SLA urgency level based on order age in minutes.
 * Used to drive amber/red colouring on the KDS.
 */
export function orderAgeUrgency(iso: string | null | undefined): "ok" | "warn" | "urgent" {
  if (!iso) return "ok";
  const minutes = Math.floor((Date.now() - parseBackendIso(iso).getTime()) / 60_000);
  if (minutes >= 20) return "urgent";
  if (minutes >= 10) return "warn";
  return "ok";
}

/** IANA timezone string for the user, e.g. "Asia/Kolkata". */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
