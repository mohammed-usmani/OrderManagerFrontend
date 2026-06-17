"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type MenuItemAPI,
  type MenuItemPatchAPI,
  type MenuItemCreateAPI,
} from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  Input,
  Modal,
  Select,
  StatusChip,
  Toolbar,
  EmptyState,
} from "@/components/admin/ui";
import { formatPrice } from "@/lib/brand";

type SortKey = "name" | "price" | "category" | "id";
type SortDir = "asc" | "desc";

const CATEGORIES = ["starters", "mains", "breads", "rice", "desserts", "beverages"];

export default function AdminMenuPage() {
  const { isAuthenticated, user, token } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<MenuItemAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters / sort / selection
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "disabled">("all");
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemAPI | null>(null);

  // Inline editing
  type EditableField = "name" | "price" | "spice_level" | "serving" | "category";
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: EditableField;
  } | null>(null);
  const [cellDraft, setCellDraft] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/signin");
      return;
    }
    if (user && !user.is_admin) router.replace("/chat");
  }, [isAuthenticated, user, router]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.adminListMenu(token);
      setItems(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Filter / sort ---

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = items;
    if (q) {
      out = out.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q) ||
          (i.description?.toLowerCase().includes(q) ?? false)
      );
    }
    if (categoryFilter) out = out.filter((i) => i.category === categoryFilter);
    if (availabilityFilter === "available") out = out.filter((i) => i.available);
    if (availabilityFilter === "disabled") out = out.filter((i) => !i.available);
    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey] as string | number;
      const vb = b[sortKey] as string | number;
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
    return out;
  }, [items, search, categoryFilter, availabilityFilter, sortKey, sortDir]);

  // --- Mutators ---

  const markBusy = (ids: string[], busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) busy ? next.add(id) : next.delete(id);
      return next;
    });

  const patchItem = useCallback(
    async (id: string, body: MenuItemPatchAPI) => {
      if (!token) return;
      markBusy([id], true);
      try {
        await api.adminUpdateMenuItem(token, id, body);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        markBusy([id], false);
      }
    },
    [token, load]
  );

  const toggleAvailability = useCallback(
    async (item: MenuItemAPI) => {
      if (!token) return;
      markBusy([item.id], true);
      try {
        if (item.available) {
          await api.adminDisableMenuItem(token, item.id);
        } else {
          await api.adminUpdateMenuItem(token, item.id, { available: true });
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        markBusy([item.id], false);
      }
    },
    [token, load]
  );

  const bulkSetAvailability = useCallback(
    async (available: boolean) => {
      if (!token || selected.size === 0) return;
      const ids = Array.from(selected);
      markBusy(ids, true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) =>
            available
              ? api.adminUpdateMenuItem(token, id, { available: true })
              : api.adminDisableMenuItem(token, id)
          )
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        const succeeded = results.length - failed;
        // Keep failed ids selected so the user can retry them.
        const successIds = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
        setSelected((prev) => {
          const next = new Set(prev);
          successIds.forEach((id) => next.delete(id));
          return next;
        });
        if (failed > 0) setError(`Updated ${succeeded} of ${ids.length}; ${failed} failed.`);
      } finally {
        markBusy(ids, false);
        await load();
      }
    },
    [token, selected, load]
  );

  // --- Inline cell edit ---

  const beginCellEdit = (
    id: string,
    field: EditableField,
    current: string | number | null,
  ) => {
    setEditingCell({ id, field });
    setCellDraft(current == null ? "" : String(current));
  };

  const commitCellEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    setEditingCell(null);
    const trimmed = cellDraft.trim();
    const body: MenuItemPatchAPI = {};
    if (field === "price") {
      const n = parseFloat(trimmed);
      if (!isNaN(n)) body.price = n;
    } else if (field === "name") {
      if (trimmed) body.name = trimmed;
    } else if (field === "category") {
      if (trimmed) body.category = trimmed;
    } else {
      // spice_level or serving can be cleared
      (body as Record<string, string | null>)[field] = trimmed || null;
    }
    if (Object.keys(body).length > 0) await patchItem(id, body);
  };

  // --- Selection ---

  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visible.map((i) => i.id)));
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  if (!isAuthenticated || !user?.is_admin) return null;

  return (
    <AppShell title="Menu">
      <AdminShell>
        <PageHeader
          title="Menu"
          badge={items.length}
          subtitle={`${items.filter((i) => !i.available).length} disabled`}
          actions={
            <>
              <Input
                data-search
                leadingIcon="search"
                placeholder="Search by id, name, description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72 hidden md:block"
              />
              <Button variant="primary" icon="add" onClick={() => setCreateOpen(true)}>
                Add item
              </Button>
            </>
          }
        />

        <Toolbar>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
          <Select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
          >
            <option value="all">All availability</option>
            <option value="available">Available only</option>
            <option value="disabled">Disabled only</option>
          </Select>
          <Input
            data-search
            leadingIcon="search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:hidden flex-1 min-w-[160px]"
          />
          <div className="flex-1" />
          {selected.size > 0 && (
            <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-primary/8 border border-primary/20">
              <span className="text-xs font-semibold text-primary">{selected.size} selected</span>
              <Button size="xs" onClick={() => bulkSetAvailability(true)}>Enable</Button>
              <Button size="xs" variant="danger" onClick={() => bulkSetAvailability(false)}>Disable</Button>
            </div>
          )}
        </Toolbar>

        <main className="flex-1 overflow-y-auto px-4 md:px-8 pt-5 pb-28 md:pb-8 max-w-[1600px] mx-auto w-full">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {[1,2,3,4,5].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          )}

          {!loading && visible.length === 0 && (
            <EmptyState
              icon="restaurant_menu"
              title={search || categoryFilter ? "No items match" : "No menu items yet"}
              description={search || categoryFilter ? "Try adjusting your search or filters." : "Add your first dish to get started."}
              action={
                !search && !categoryFilter ? (
                  <Button variant="primary" icon="add" onClick={() => setCreateOpen(true)}>Add item</Button>
                ) : undefined
              }
            />
          )}

          {!loading && visible.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader>
                <p className="font-semibold text-ink text-sm">{visible.length} items</p>
                <p className="text-xs text-ink-faint">Click a cell to edit inline</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-paper-sunken/70 border-b border-line">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="cursor-pointer"
                        />
                      </th>
                      <SortableTh label="ID" k="id" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Category" k="category" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <SortableTh label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} right />
                      <th className="px-4 py-3">Spice</th>
                      <th className="px-4 py-3">Serving</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => {
                      const busy = busyIds.has(item.id);
                      const isSelected = selected.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-line last:border-0 transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-paper-sunken/50"
                          } ${busy ? "opacity-50 pointer-events-none" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(item.id)}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-[11px] text-ink-faint bg-paper-sunken border border-line px-1.5 py-0.5 rounded">
                              {item.id}
                            </span>
                          </td>
                          <EditableCell
                            active={editingCell?.id === item.id && editingCell.field === "name"}
                            draft={cellDraft}
                            onDraftChange={setCellDraft}
                            onBeginEdit={() => beginCellEdit(item.id, "name", item.name)}
                            onCommit={commitCellEdit}
                            onCancel={() => setEditingCell(null)}
                          >
                            <span className="font-medium text-ink">{item.name}</span>
                          </EditableCell>
                          <EditableCell
                            active={editingCell?.id === item.id && editingCell.field === "category"}
                            draft={cellDraft}
                            onDraftChange={setCellDraft}
                            onBeginEdit={() => beginCellEdit(item.id, "category", item.category)}
                            onCommit={commitCellEdit}
                            onCancel={() => setEditingCell(null)}
                          >
                            <span className="text-ink-soft lowercase">{item.category}</span>
                          </EditableCell>
                          <EditableCell
                            right
                            active={editingCell?.id === item.id && editingCell.field === "price"}
                            draft={cellDraft}
                            onDraftChange={setCellDraft}
                            onBeginEdit={() => beginCellEdit(item.id, "price", item.price)}
                            onCommit={commitCellEdit}
                            onCancel={() => setEditingCell(null)}
                            inputMode="decimal"
                          >
                            <span className="font-medium text-ink tabular-nums">
                              {formatPrice(item.price)}
                            </span>
                          </EditableCell>
                          <EditableCell
                            active={editingCell?.id === item.id && editingCell.field === "spice_level"}
                            draft={cellDraft}
                            onDraftChange={setCellDraft}
                            onBeginEdit={() => beginCellEdit(item.id, "spice_level", item.spice_level)}
                            onCommit={commitCellEdit}
                            onCancel={() => setEditingCell(null)}
                          >
                            <span className="text-ink-soft">{item.spice_level || "—"}</span>
                          </EditableCell>
                          <EditableCell
                            active={editingCell?.id === item.id && editingCell.field === "serving"}
                            draft={cellDraft}
                            onDraftChange={setCellDraft}
                            onBeginEdit={() => beginCellEdit(item.id, "serving", item.serving)}
                            onCommit={commitCellEdit}
                            onCancel={() => setEditingCell(null)}
                          >
                            <span className="text-ink-soft">{item.serving || "—"}</span>
                          </EditableCell>
                          <td className="px-4 py-3">
                            <StatusChip status={item.available ? "available" : "disabled"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                icon="edit"
                                onClick={() => setEditingItem(item)}
                                disabled={busy}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant={item.available ? "ghost" : "secondary"}
                                icon={item.available ? "visibility_off" : "visibility"}
                                onClick={() => toggleAvailability(item)}
                                disabled={busy}
                              >
                                {item.available ? "Hide" : "Show"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <p className="text-xs text-ink-faint mt-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">touch_app</span>
            Click any cell to edit inline.
            Press <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to cancel.
            Changes apply live to the voice agent and customer views.
          </p>
        </main>

        <CreateItemModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
          existingIds={items.map((i) => i.id)}
          token={token ?? ""}
        />
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            load();
          }}
          token={token ?? ""}
        />
      </AdminShell>
    </AppShell>
  );
}

// --- Sortable table header ------------------------------------------------

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  right,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`px-4 py-3 cursor-pointer select-none hover:text-ink transition-colors ${
        right ? "text-right" : ""
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-ink" : ""}`}>
        {label}
        {active && (
          <span className="material-symbols-outlined text-[12px] leading-none">
            {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
          </span>
        )}
      </span>
    </th>
  );
}

// --- Inline-editable table cell -------------------------------------------

function EditableCell({
  active,
  draft,
  onDraftChange,
  onBeginEdit,
  onCommit,
  onCancel,
  children,
  right,
  inputMode,
}: {
  active: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onBeginEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
  right?: boolean;
  inputMode?: "text" | "decimal";
}) {
  if (active) {
    return (
      <td className="px-4 py-2 align-middle">
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
          inputMode={inputMode}
          className={`w-full h-7 px-2.5 rounded-lg border border-primary bg-paper-raised text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 ${
            right ? "text-right tabular-nums" : ""
          }`}
        />
      </td>
    );
  }
  return (
    <td
      onClick={onBeginEdit}
      className={`px-4 py-3 cursor-text group/cell relative hover:bg-paper-sunken/50 transition-colors ${right ? "text-right" : ""}`}
    >
      {children}
    </td>
  );
}

// --- Edit-item modal (all fields) -----------------------------------------

function EditItemModal({
  item,
  onClose,
  onSaved,
  token,
}: {
  item: MenuItemAPI | null;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [form, setForm] = useState<MenuItemPatchAPI>({});
  const [dietaryStr, setDietaryStr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Populate when item changes
  useEffect(() => {
    if (!item) { setForm({}); setDietaryStr(""); setErr(""); setBusy(false); return; }
    setForm({
      name:          item.name,
      category:      item.category,
      price:         item.price,
      description:   item.description,
      how_its_made:  item.how_its_made ?? null,
      taste_profile: item.taste_profile ?? null,
      spice_level:   item.spice_level,
      serving:       item.serving,
      dietary:       item.dietary,
      popularity:    item.popularity ?? null,
      popularity_note: item.popularity_note ?? null,
      image_url:     item.image_url,
      available:     item.available,
    });
    setDietaryStr((item.dietary ?? []).join(", "));
    setErr("");
  }, [item]);

  const onPickImage = async (file: File | undefined) => {
    if (!file || !token) return;
    setUploading(true);
    setErr("");
    try {
      const { image_url } = await api.adminUploadMenuImage(token, file);
      setForm((f) => ({ ...f, image_url }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!item || !token) return;
    if (!form.name || !form.category) { setErr("Name and category are required."); return; }
    const dietary = dietaryStr.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setErr("");
    try {
      await api.adminUpdateMenuItem(token, item.id, { ...form, dietary: dietary.length ? dietary : null });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item ? `Edit · ${item.name}` : "Edit item"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || uploading}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      <ImageUploadField
        imageUrl={form.image_url ?? ""}
        uploading={uploading}
        onPick={onPickImage}
        onUrlChange={(v) => setForm((f) => ({ ...f, image_url: v || null }))}
        onClear={() => setForm((f) => ({ ...f, image_url: null }))}
      />

      <div className="grid grid-cols-2 gap-3 mt-1">
        <Labeled label={`ID (read-only)`} full>
          <Input value={item?.id ?? ""} disabled className="opacity-60 cursor-not-allowed" />
        </Labeled>
        <Labeled label="Category">
          <Select
            value={form.category ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Name" full>
          <Input value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Labeled>
        <Labeled label="Price (₹)">
          <Input
            inputMode="decimal"
            value={form.price == null ? "" : String(form.price)}
            onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
          />
        </Labeled>
        <Labeled label="Serving">
          <Input
            value={form.serving ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, serving: e.target.value || null }))}
            placeholder="e.g. serves 2 / 6 pieces"
          />
        </Labeled>
        <Labeled label="Spice level">
          <Input
            value={form.spice_level ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, spice_level: e.target.value || null }))}
            placeholder="mild / medium / hot"
          />
        </Labeled>
        <Labeled label="Dietary (comma-separated)">
          <Input
            value={dietaryStr}
            onChange={(e) => setDietaryStr(e.target.value)}
            placeholder="vegan, gluten-free"
          />
        </Labeled>
        <Labeled label="Taste profile" full>
          <Input
            value={form.taste_profile ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, taste_profile: e.target.value || null }))}
            placeholder="rich, creamy, mildly sweet"
          />
        </Labeled>
        <Labeled label="Description" full>
          <Input
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
          />
        </Labeled>
        <Labeled label="How it's made" full>
          <Input
            value={form.how_its_made ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, how_its_made: e.target.value || null }))}
          />
        </Labeled>
        <Labeled label="Popularity (1–5)">
          <Input
            inputMode="decimal"
            value={form.popularity == null ? "" : String(form.popularity)}
            onChange={(e) => setForm((f) => ({ ...f, popularity: e.target.value ? parseFloat(e.target.value) : null }))}
          />
        </Labeled>
        <Labeled label="Popularity note">
          <Input
            value={form.popularity_note ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, popularity_note: e.target.value || null }))}
            placeholder="Our #1 seller"
          />
        </Labeled>
        <Labeled label="Available">
          <label className="flex items-center gap-2 h-9 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.available ?? true}
              onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
            <span className="text-sm text-ink-soft">Visible to customers</span>
          </label>
        </Labeled>
      </div>
    </Modal>
  );
}

// --- Create-item modal ----------------------------------------------------

function CreateItemModal({
  open,
  onClose,
  onCreated,
  existingIds,
  token,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingIds: string[];
  token: string;
}) {
  const EMPTY: MenuItemCreateAPI = {
    id: "",
    name: "",
    category: "mains",
    price: 0,
    currency: "INR",
  };
  const [form, setForm] = useState<MenuItemCreateAPI>(EMPTY);
  const [dietaryStr, setDietaryStr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setDietaryStr("");
      setErr("");
      setBusy(false);
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const { image_url } = await api.adminUploadMenuImage(token, file);
      setForm((f) => ({ ...f, image_url }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!form.id || !form.name || !form.category) {
      setErr("ID, name, and category are required.");
      return;
    }
    if (existingIds.includes(form.id)) {
      setErr(`ID "${form.id}" is already in use.`);
      return;
    }
    const dietary = dietaryStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    setErr("");
    try {
      await api.adminCreateMenuItem(token, {
        ...form,
        dietary: dietary.length ? dietary : null,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add menu item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || uploading}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      {err && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      )}

      <ImageUploadField
        imageUrl={form.image_url ?? ""}
        uploading={uploading}
        onPick={onPickImage}
        onUrlChange={(v) => setForm({ ...form, image_url: v || null })}
        onClear={() => setForm({ ...form, image_url: null })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="ID (e.g. M07)">
          <Input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })}
          />
        </Labeled>
        <Labeled label="Category">
          <Select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Name" full>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Labeled>
        <Labeled label="Price (₹)">
          <Input
            inputMode="decimal"
            value={String(form.price ?? "")}
            onChange={(e) =>
              setForm({ ...form, price: parseFloat(e.target.value) || 0 })
            }
          />
        </Labeled>
        <Labeled label="Serving">
          <Input
            value={form.serving ?? ""}
            onChange={(e) => setForm({ ...form, serving: e.target.value || null })}
            placeholder="e.g. serves 2 / 6 pieces"
          />
        </Labeled>
        <Labeled label="Spice level">
          <Input
            value={form.spice_level ?? ""}
            onChange={(e) => setForm({ ...form, spice_level: e.target.value || null })}
            placeholder="mild / medium / hot"
          />
        </Labeled>
        <Labeled label="Dietary (comma-separated)">
          <Input
            value={dietaryStr}
            onChange={(e) => setDietaryStr(e.target.value)}
            placeholder="vegan, gluten-free"
          />
        </Labeled>
        <Labeled label="Taste profile" full>
          <Input
            value={form.taste_profile ?? ""}
            onChange={(e) => setForm({ ...form, taste_profile: e.target.value || null })}
            placeholder="rich, creamy, mildly sweet"
          />
        </Labeled>
        <Labeled label="Description" full>
          <Input
            value={form.description ?? ""}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value || null })
            }
          />
        </Labeled>
        <Labeled label="How it's made" full>
          <Input
            value={form.how_its_made ?? ""}
            onChange={(e) => setForm({ ...form, how_its_made: e.target.value || null })}
          />
        </Labeled>
        <Labeled label="Popularity (1–5)">
          <Input
            inputMode="decimal"
            value={form.popularity == null ? "" : String(form.popularity)}
            onChange={(e) =>
              setForm({
                ...form,
                popularity: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
        </Labeled>
        <Labeled label="Popularity note">
          <Input
            value={form.popularity_note ?? ""}
            onChange={(e) =>
              setForm({ ...form, popularity_note: e.target.value || null })
            }
            placeholder="Our #1 seller"
          />
        </Labeled>
      </div>
    </Modal>
  );
}

// --- Image upload + URL field --------------------------------------------

function ImageUploadField({
  imageUrl,
  uploading,
  onPick,
  onUrlChange,
  onClear,
}: {
  imageUrl: string;
  uploading: boolean;
  onPick: (file: File | undefined) => void;
  onUrlChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-paper-sunken/50 p-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        Image
      </span>
      <div className="mt-2 flex items-start gap-3">
        <div className="w-20 h-20 shrink-0 rounded-md border border-line bg-paper-raised overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-ink-faint text-[28px]">
              image
            </span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-strong bg-paper-raised text-xs font-medium text-ink hover:bg-paper-sunken/60 cursor-pointer">
              <span className="material-symbols-outlined text-[16px]">upload</span>
              {uploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => onPick(e.target.files?.[0])}
              />
            </label>
            {imageUrl && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                Remove
              </Button>
            )}
          </div>
          <Input
            value={imageUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="…or paste an image URL"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
