"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";

export default function ProfilePage() {
  const { isAuthenticated, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <AppShell>
      <main className="flex-1 mt-16 md:mt-0 mb-24 md:mb-0 px-4 max-w-md mx-auto w-full">
        <div className="py-8 space-y-6">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center ring-2 ring-primary/20 shadow-xl shadow-primary/10">
              <span className="font-headline font-extrabold text-2xl text-primary">
                {initials}
              </span>
            </div>
            <div className="text-center">
              <p className="font-headline font-extrabold text-xl text-white">
                {user.email.split("@")[0]}
              </p>
              <p className="text-on-surface-variant text-sm mt-1">{user.email}</p>
              {user.is_admin && (
                <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-[10px] font-bold uppercase tracking-widest font-headline">
                  <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    verified
                  </span>
                  Admin
                </span>
              )}
            </div>
          </div>

          {/* Menu items — admin & customer see different shortcuts */}
          <div className="glass-panel rounded-2xl divide-y divide-white/5">
            {(user.is_admin
              ? [
                  { icon: "dashboard", label: "Dashboard", action: () => router.push("/admin") },
                  { icon: "soup_kitchen", label: "Kitchen", action: () => router.push("/admin/orders") },
                  { icon: "restaurant_menu", label: "Menu", action: () => router.push("/admin/menu") },
                ]
              : [
                  { icon: "receipt_long", label: "My Orders", action: () => router.push("/orders") },
                  { icon: "chat_bubble", label: "Start Chat", action: () => router.push("/chat") },
                ]
            ).map(({ icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
              >
                <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                  {icon}
                </span>
                <span className="text-white font-medium text-sm flex-1 text-left">{label}</span>
                <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
                  chevron_right
                </span>
              </button>
            ))}
          </div>

          {/* Sign out - only show on mobile since sidebar has it on desktop */}
          <button
            onClick={handleLogout}
            className="md:hidden w-full flex items-center justify-center gap-3 py-4 rounded-2xl glass-panel text-error font-headline font-bold text-sm tracking-wide border-error/10 hover:bg-error/5 hover:border-error/20 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Sign Out
          </button>
        </div>
      </main>
    </AppShell>
  );
}
