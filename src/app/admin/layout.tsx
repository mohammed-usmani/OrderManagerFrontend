import type { ReactNode } from "react";
import { AdminKeyboardProvider } from "@/components/admin/AdminKeyboardProvider";

/**
 * Admin layout — mounts the keyboard-shortcut provider ONCE for every /admin
 * route. Because it lives here (not per-page), the global key listener, command
 * palette (⌘K), shortcuts help (?), and goto chords (G+letter) stay active and
 * persistent across admin navigation — no need to click the page on each route.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminKeyboardProvider>{children}</AdminKeyboardProvider>;
}
