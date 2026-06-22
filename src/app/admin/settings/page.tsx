"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type RestaurantProfileAPI,
  type Weekday,
  type HoursWindowAPI,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, CardHeader, CardBody, Input } from "@/components/admin/ui";

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

// Profile text fields rendered as a labelled grid.
const FIELDS: { key: keyof RestaurantProfileAPI; label: string; full?: boolean }[] = [
  { key: "name", label: "Display name" },
  { key: "legal_name", label: "Legal name (invoice)" },
  { key: "cuisine", label: "Cuisine" },
  { key: "tagline", label: "Tagline", full: true },
  { key: "address_line1", label: "Address line 1", full: true },
  { key: "address_line2", label: "Address line 2", full: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "gstin", label: "GSTIN" },
  { key: "fssai", label: "FSSAI licence" },
  { key: "timezone", label: "Timezone (IANA)" },
];

export default function AdminSettingsPage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<RestaurantProfileAPI | null>(null);
  const [saved, setSaved] = useState<RestaurantProfileAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.getRestaurantProfile();
      setProfile(p);
      setSaved(p);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(saved),
    [profile, saved],
  );

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const setField = (key: keyof RestaurantProfileAPI, value: string) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));

  const setWindow = (day: Weekday, i: number, which: "open" | "close", value: string) =>
    setProfile((p) => {
      if (!p) return p;
      const windows = [...(p.hours[day] ?? [])];
      windows[i] = { ...windows[i], [which]: value };
      return { ...p, hours: { ...p.hours, [day]: windows } };
    });

  const addWindow = (day: Weekday) =>
    setProfile((p) => {
      if (!p) return p;
      const windows = [...(p.hours[day] ?? []), { open: "11:00", close: "15:00" } as HoursWindowAPI];
      return { ...p, hours: { ...p.hours, [day]: windows } };
    });

  const removeWindow = (day: Weekday, i: number) =>
    setProfile((p) => {
      if (!p) return p;
      const windows = (p.hours[day] ?? []).filter((_, idx) => idx !== i);
      return { ...p, hours: { ...p.hours, [day]: windows } };
    });

  const save = async () => {
    if (!token || !profile) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.adminUpdateRestaurantProfile(token, profile);
      setProfile(res);
      setSaved(res);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Settings">
      <AdminShell>
        <PageHeader
          title="Restaurant settings"
          subtitle="Identity, GST details & opening hours — used on invoices and by the voice agent"
          actions={
            <div className="flex items-center gap-2">
              {dirty && !saving && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              <Button variant="primary" icon="save" onClick={save} disabled={saving || loading || !dirty}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          }
        />

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-28 md:pb-8 max-w-[1100px] mx-auto w-full space-y-5">
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {savedAt && !error && !dirty && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Settings saved. Invoices and the voice agent now use these values.
            </div>
          )}

          {loading || !profile ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <p className="font-semibold text-ink text-sm">Identity &amp; GST</p>
                  <p className="text-xs text-ink-faint">Shown on the printed tax invoice and the public site.</p>
                </CardHeader>
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {FIELDS.map(({ key, label, full }) => (
                      <label key={key} className={`block ${full ? "md:col-span-2" : ""}`}>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
                        <div className="mt-1">
                          <Input
                            value={(profile[key] as string) ?? ""}
                            onChange={(e) => setField(key, e.target.value)}
                            className="w-full"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <p className="font-semibold text-ink text-sm">Opening hours</p>
                  <p className="text-xs text-ink-faint">Add a window per service. No windows = closed that day. Times are 24-hour.</p>
                </CardHeader>
                <CardBody>
                  <div className="space-y-2.5">
                    {DAYS.map(({ key, label }) => {
                      const windows = profile.hours[key] ?? [];
                      return (
                        <div key={key} className="flex items-start gap-3 py-1.5 border-b border-line last:border-0">
                          <span className="w-24 shrink-0 text-sm font-medium text-ink pt-1.5">{label}</span>
                          <div className="flex-1 flex flex-wrap items-center gap-2">
                            {windows.length === 0 && (
                              <span className="text-xs text-ink-faint pt-1.5">Closed</span>
                            )}
                            {windows.map((w, i) => (
                              <div key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-sunken/40 px-2 py-1">
                                <input
                                  type="time"
                                  value={w.open}
                                  onChange={(e) => setWindow(key, i, "open", e.target.value)}
                                  className="bg-transparent text-sm text-ink outline-none tabular-nums"
                                />
                                <span className="text-ink-faint text-xs">–</span>
                                <input
                                  type="time"
                                  value={w.close}
                                  onChange={(e) => setWindow(key, i, "close", e.target.value)}
                                  className="bg-transparent text-sm text-ink outline-none tabular-nums"
                                />
                                <button
                                  onClick={() => removeWindow(key, i)}
                                  className="ml-0.5 text-ink-faint hover:text-rose-500 transition-colors"
                                  aria-label="Remove window"
                                >
                                  <span className="material-symbols-outlined text-[15px]">close</span>
                                </button>
                              </div>
                            ))}
                            <Button size="xs" variant="ghost" icon="add" onClick={() => addWindow(key)}>
                              Window
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>

              <p className="text-xs text-ink-faint">
                Charge rules (service charge, GST, AC surcharge) live on the{" "}
                <a href="/admin/pricing" className="underline hover:text-primary">Pricing</a> page.
              </p>
            </>
          )}
        </main>
      </AdminShell>
    </AppShell>
  );
}
