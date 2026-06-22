"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { API_URL, onUnauthorized } from "@/lib/api";

export type StaffRole = "owner" | "manager" | "cashier" | "waiter" | "chef" | "none";

export interface AuthUser {
  id: string;
  email: string;
  is_admin: boolean;
  role: StaffRole;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, name: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function decodeJwt(token: string): AuthUser | null {
  try {
    // base64url → base64 → JSON
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const b64 = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    ));
    // Reject expired tokens immediately
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
    return {
      id: payload.sub,
      email: payload.email,
      is_admin: payload.is_admin ?? false,
      role: (payload.role ?? (payload.is_admin ? "manager" : "none")) as StaffRole,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const logoutRef = useRef<() => void>(() => {});

  // Keep logoutRef in sync so the 401 handler always calls the latest logout.
  useEffect(() => {
    logoutRef.current = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem("oracle_token");
    };
    const handler = () => logoutRef.current();
    onUnauthorized.push(handler);
    return () => {
      const idx = onUnauthorized.indexOf(handler);
      if (idx >= 0) onUnauthorized.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("oracle_token");
    if (stored) {
      const decoded = decodeJwt(stored);
      if (decoded) {
        setToken(stored);
        setUser(decoded);
      } else {
        localStorage.removeItem("oracle_token");
      }
    }
    setReady(true);
  }, []);

  /**
   * Shared fetch helper for auth endpoints (login / register). Routes through
   * the same API_URL base so ngrok-skip headers or URL overrides are applied
   * consistently — unlike the old per-route raw fetch calls.
   */
  const authRequest = async (
    path: string,
    body: Record<string, string>,
    defaultError: string,
  ): Promise<AuthUser> => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
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
    const data = await res.json();
    const decoded = decodeJwt(data.access_token);
    if (!decoded) throw new Error("Invalid token received");
    setToken(data.access_token);
    setUser(decoded);
    localStorage.setItem("oracle_token", data.access_token);
    return decoded;
  };

  const login = (email: string, password: string) =>
    authRequest("/auth/login", { email, password }, "Login failed");

  const register = (email: string, password: string, name: string) =>
    authRequest("/auth/register", { email, password, name }, "Registration failed");

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("oracle_token");
  };

  if (!ready) return null;

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!token, login, register, logout }}
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
