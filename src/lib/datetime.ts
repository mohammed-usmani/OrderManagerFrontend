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

/** IANA timezone string for the user, e.g. "Asia/Kolkata". */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
