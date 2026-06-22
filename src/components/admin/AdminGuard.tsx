"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, defaultRouteForRole, isStaffRole } from "@/lib/adminRoutes";

/**
 * Client-side admin gate, mounted once in the admin layout. Redirects anonymous
 * users to sign-in and non-admins to /chat, and renders nothing until the
 * decision is made. Server-side API auth remains the real boundary; this just
 * keeps non-admins out of the admin UI and removes the redirect boilerplate
 * that was previously copy-pasted into every admin page.
 *
 * Safe to check synchronously: AuthProvider withholds its children until the
 * stored token is resolved (`ready`), so isAuthenticated/user are settled on
 * the first render reached here.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const staff = isStaffRole(user?.role);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user && !staff) {
      // Logged in but not staff (e.g. a public registrant) → customer app.
      router.replace("/chat");
      return;
    }
    // Staff on a page their role can't see → bounce to their home page.
    if (user && staff && !canAccess(pathname, user.role)) {
      router.replace(defaultRouteForRole(user.role));
    }
  }, [isAuthenticated, user, staff, pathname, router]);

  if (!isAuthenticated || !staff) return null;
  if (user && !canAccess(pathname, user.role)) return null;
  return <>{children}</>;
}
