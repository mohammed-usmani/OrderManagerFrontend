/** Escape text for interpolation into an HTML string (e.g. print windows built
 *  with document.write). React escapes JSX on its own; raw HTML strings don't. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
