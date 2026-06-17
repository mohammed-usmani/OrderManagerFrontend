"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

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

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || !user?.is_admin) return null;
  return <>{children}</>;
}
