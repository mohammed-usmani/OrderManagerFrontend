"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function SignInPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loggedIn = await login(email, password);
      router.replace(loggedIn.is_admin ? "/admin" : "/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] max-w-[90vw] h-[320px] rounded-full bg-primary/8 blur-[110px] pointer-events-none" />

      <div className="w-full max-w-sm space-y-7 relative reveal">
        <div className="text-center space-y-3">
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-2 mb-2">
            <span
              className="material-symbols-outlined text-primary text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
            <span className="font-headline font-semibold text-lg text-on-surface tracking-tight">
              Saffron <span className="text-primary">&amp;</span> Smoke
            </span>
          </button>
          <div className="flex items-center justify-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px]">lock</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em]">Staff entrance</span>
          </div>
          <h2 className="font-headline font-semibold text-3xl text-on-surface">Back of house</h2>
          <p className="text-on-surface-variant text-sm">Sign in to manage the kitchen.</p>
        </div>

        <form onSubmit={handleSubmit} className="ember-card rounded-2xl p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-error/10 border border-error/20">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <p className="text-error text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@saffronandsmoke.in"
              className="w-full bg-surface-container-highest border border-white/10 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-surface-container-highest border border-white/10 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-primary text-on-primary font-headline font-semibold text-sm tracking-wide hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1 shadow-[0_12px_34px_-12px_rgba(255,106,26,0.7)]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                Signing in…
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="text-center">
          <button
            onClick={() => router.push("/chat")}
            className="text-on-surface-variant text-sm hover:text-on-surface transition-colors inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Just here to order? Talk to Arjun
          </button>
        </p>
      </div>
    </main>
  );
}
