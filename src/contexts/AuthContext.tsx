"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { API_URL, onUnauthorized } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  is_admin: boolean;
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
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    ));
    // Reject expired tokens immediately
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
    return {
      id: payload.sub,
      email: payload.email,
      is_admin: payload.is_admin ?? false,
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

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    const decoded = decodeJwt(data.access_token);
    if (!decoded) throw new Error("Invalid token received");
    setToken(data.access_token);
    setUser(decoded);
    localStorage.setItem("oracle_token", data.access_token);
    return decoded;
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Registration failed" }));
      throw new Error(err.detail || "Registration failed");
    }
    const data = await res.json();
    const decoded = decodeJwt(data.access_token);
    if (!decoded) throw new Error("Invalid token received");
    setToken(data.access_token);
    setUser(decoded);
    localStorage.setItem("oracle_token", data.access_token);
    return decoded;
  };

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
