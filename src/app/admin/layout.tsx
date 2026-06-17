import type { ReactNode } from "react";
import { AdminKeyboardProvider } from "@/components/admin/AdminKeyboardProvider";
import { AdminGuard } from "@/components/admin/AdminGuard";

/**
 * Admin layout — gates every /admin route behind AdminGuard (redirects
 * non-admins) and mounts the keyboard-shortcut provider ONCE. Because both live
 * here (not per-page), the global key listener, command palette (⌘K), shortcuts
 * help (?), and goto chords (G+letter) stay active across admin navigation, and
 * each page no longer needs its own auth redirect boilerplate.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <AdminKeyboardProvider>{children}</AdminKeyboardProvider>
    </AdminGuard>
  );
}
