"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Public self-signup has been removed — ordering needs no account (the voice
 * agent identifies callers by a 4-digit code) and staff accounts are managed
 * internally. Anyone hitting this route is sent to the ordering line.
 */
export default function SignUpRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  return (
    <main className="min-h-dvh flex items-center justify-center">
      <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </main>
  );
}
