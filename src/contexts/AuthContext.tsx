"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_URL, apiFetch, onUnauthorized } from "@/lib/api";

export type StaffRole = "owner" | "manager" | "cashier" | "waiter" | "chef" | "none";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  role: StaffRole;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** False until GET /auth/me has answered; gate redirects on this. */
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, name: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * The session lives in an httpOnly cookie the browser sends with every API
 * call; JS never sees it. The user is learned from GET /auth/me on mount and
 * from the login/register responses.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiFetch<{ user: AuthUser }>("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null)) // 401 = signed out; network error = treat as signed out
      .finally(() => setReady(true));
  }, []);

  // Any 401 from the API signs the user out.
  useEffect(() => {
    const handler = () => setUser(null);
    onUnauthorized.push(handler);
    return () => {
      const idx = onUnauthorized.indexOf(handler);
      if (idx >= 0) onUnauthorized.splice(idx, 1);
    };
  }, []);

  /**
   * Shared fetch helper for login / register. Not apiFetch: a 401 here means
   * bad credentials, so the server's `detail` should reach the form instead of
   * the generic "session expired" message.
   */
  const authRequest = async (
    path: string,
    body: Record<string, string>,
    defaultError: string,
  ): Promise<AuthUser> => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        // Match apiFetch so ngrok tunnels return JSON, not the interstitial HTML.
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: defaultError }));
      throw new Error(err.detail || defaultError);
    }
    const data: { user: AuthUser } = await res.json();
    setUser(data.user);
    return data.user;
  };

  const login = (email: string, password: string) =>
    authRequest("/auth/login", { email, password }, "Login failed");

  const register = (email: string, password: string, name: string) =>
    authRequest("/auth/register", { email, password, name }, "Registration failed");

  // Clear the user even if the request fails — the UI should never look signed in.
  const logout = () =>
    apiFetch<void>("/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => setUser(null));

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, ready, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
