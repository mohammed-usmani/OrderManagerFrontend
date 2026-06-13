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
  const [shakeKey, setShakeKey] = useState(0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const loggedIn = await login(email, password);
      router.replace(loggedIn.is_admin ? "/admin" : "/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setShakeKey((k) => k + 1); // re-trigger shake animation
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Atmosphere glow */}
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[520px] max-w-[90vw] h-[340px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative reveal">
        {/* Brand mark */}
        <div className="text-center mb-8 space-y-3">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span
                className="material-symbols-outlined text-primary text-[20px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
            </div>
            <span className="font-headline font-semibold text-xl text-on-surface tracking-tight">
              Saffron <span className="text-primary">&amp;</span> Smoke
            </span>
          </button>

          <div className="flex items-center justify-center gap-2 text-on-surface-variant/60 mt-1">
            <span className="h-px w-8 bg-white/10" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em]">Staff entrance</span>
            <span className="h-px w-8 bg-white/10" />
          </div>

          <h2 className="font-headline font-light text-on-surface text-4xl leading-tight">
            Back of house
          </h2>
          <p className="text-on-surface-variant text-sm">
            Sign in to manage the kitchen and orders.
          </p>
        </div>

        {/* Card */}
        <form
          key={shakeKey}
          onSubmit={handleSubmit}
          className={`ember-card rounded-2xl p-6 space-y-4 ${error ? "animate-shake" : ""}`}
        >
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-error/10 border border-error/20">
              <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">error</span>
              <p className="text-error text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Email field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              Email
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px] absolute left-3.5 pointer-events-none select-none">
                alternate_email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@saffronandsmoke.in"
                className="w-full pl-9 pr-4 py-3 bg-surface-container-highest border border-white/10 rounded-xl text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all text-sm"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              Password
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px] absolute left-3.5 pointer-events-none select-none">
                lock
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-9 pr-4 py-3 bg-surface-container-highest border border-white/10 rounded-xl text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-primary text-on-primary font-headline font-semibold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1 shadow-[0_12px_34px_-12px_rgba(255,106,26,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                Signing in&hellip;
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center mt-6">
          <button
            onClick={() => router.push("/chat")}
            className="text-on-surface-variant/70 text-sm hover:text-on-surface transition-colors inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Just here to order? Talk to Arjun
          </button>
        </p>
      </div>
    </main>
  );
}
