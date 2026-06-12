const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Bypass ngrok's HTML interstitial so tunneled API calls return JSON, not
    // the "You are about to visit…" page. Harmless on non-ngrok backends.
    "ngrok-skip-browser-warning": "true",
    ...(rest.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  // 204 No Content and other empty-body responses have nothing to parse.
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface MenuItemAPI {
  id: string;
  name: string;
  description: string | null;
  how_its_made?: string | null;
  taste_profile?: string | null;
  category: string;
  price: number;
  currency: string;
  serving: string | null;
  dietary: string[] | null;
  spice_level: string | null;
  popularity?: number | null;
  popularity_note?: string | null;
  image_url: string | null;
  available: boolean;
}

export interface OrderItemAPI {
  id: string;
  menu_item_id: string;
  quantity: number;
  price_at_order: number;
  special_instructions: string | null;
}

export interface BillCharge {
  label: string;
  rate: number;
  amount: number;
}

export interface OrderAPI {
  id: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  items: OrderItemAPI[];
  subtotal: number;
  charges: BillCharge[];
  total: number; // includes all charges
}


export const api = {
  getMenu: () => apiFetch<MenuItemAPI[]>("/menu"),
  getOrders: (token: string) => apiFetch<OrderAPI[]>("/orders", { token }),
  getOrder: (id: string, token: string) =>
    apiFetch<OrderAPI>(`/orders/${id}`, { token }),
  getCurrentOrder: (token: string) =>
    apiFetch<OrderAPI>("/orders/current", { token }),
  addItemToCart: (
    token: string,
    itemId: string,
    quantity = 1,
    specialInstructions?: string,
  ) =>
    apiFetch<OrderAPI>("/orders/current/items", {
      method: "POST",
      token,
      body: JSON.stringify({
        item_id: itemId,
        quantity,
        special_instructions: specialInstructions ?? null,
      }),
    }),
  removeItemFromCart: (token: string, itemId: string) =>
    apiFetch<OrderAPI>(`/orders/current/items/${itemId}`, {
      method: "DELETE",
      token,
    }),
  // Public — the voice line is open to anyone. Token is optional (only staff
  // are ever logged in); the backend issues an anonymous ticket either way.
  getWsTicket: (token?: string, timezone?: string, tableToken?: string) =>
    apiFetch<{ ticket: string }>("/auth/ws-ticket", {
      method: "POST",
      token,
      body: JSON.stringify({
        timezone: timezone ?? null,
        table_token: tableToken ?? null,
      }),
    }),

  // Admin
  adminListOrders: (token: string, status: string = "active") =>
    apiFetch<AdminOrderAPI[]>(`/admin/orders?status=${encodeURIComponent(status)}`, {
      token,
    }),
  adminUpdateOrderStatus: (token: string, orderId: string, status: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }),
  adminAnalyticsSummary: (
    token: string,
    range: "today" | "7d" | "30d" | "all" = "today",
  ) =>
    apiFetch<AnalyticsSummaryAPI>(
      `/admin/analytics/summary?range=${range}`,
      { token },
    ),
  adminAnalyticsOverview: (token: string, range = "today") =>
    apiFetch<AnalyticsOverviewAPI>(`/admin/analytics/overview?range=${range}`, { token }),
  adminAnalyticsTimeseries: (token: string, range = "30d", granularity = "day") =>
    apiFetch<TimeseriesBucketAPI[]>(
      `/admin/analytics/timeseries?range=${range}&granularity=${granularity}`,
      { token },
    ),
  adminAnalyticsPeakHours: (token: string, range = "30d") =>
    apiFetch<PeakHourAPI[]>(`/admin/analytics/peak-hours?range=${range}`, { token }),
  adminListMenu: (token: string) =>
    apiFetch<MenuItemAPI[]>("/admin/menu", { token }),
  // Menu CRUD (admin)
  adminCreateMenuItem: (token: string, body: MenuItemCreateAPI) =>
    apiFetch<MenuItemAPI>("/menu", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  adminUpdateMenuItem: (token: string, id: string, body: MenuItemPatchAPI) =>
    apiFetch<MenuItemAPI>(`/menu/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  adminDisableMenuItem: (token: string, id: string) =>
    apiFetch<void>(`/menu/${id}`, {
      method: "DELETE",
      token,
    }),
  adminUploadMenuImage: async (token: string, file: File) => {
    // Multipart upload — must NOT set Content-Type (browser adds the boundary).
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_URL}/menu/upload-image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return (await res.json()) as { image_url: string };
  },
  adminReembedMenu: (token: string, onlyMissing = false) =>
    apiFetch<{ embedded: number }>(
      `/menu/reembed?only_missing=${onlyMissing}`,
      { method: "POST", token },
    ),

  // Customers (admin)
  adminListCustomers: (token: string, search?: string) =>
    apiFetch<CustomerAPI[]>(
      `/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      { token },
    ),
  adminGetCustomerOrders: (token: string, id: string) =>
    apiFetch<CustomerOrderSummaryAPI[]>(`/customers/${id}/orders`, { token }),
  adminCreateCustomer: (token: string, body: CustomerWriteAPI) =>
    apiFetch<CustomerAPI>("/customers", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  adminUpdateCustomer: (token: string, id: string, body: CustomerWriteAPI) =>
    apiFetch<CustomerAPI>(`/customers/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  // Zones (admin)
  adminListZones: (token: string) => apiFetch<ZoneAPI[]>("/zones", { token }),
  adminCreateZone: (token: string, body: ZoneWriteAPI) =>
    apiFetch<ZoneAPI>("/zones", { method: "POST", token, body: JSON.stringify(body) }),
  adminUpdateZone: (token: string, id: string, body: ZoneWriteAPI) =>
    apiFetch<ZoneAPI>(`/zones/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  adminDeleteZone: (token: string, id: string) =>
    apiFetch<void>(`/zones/${id}`, { method: "DELETE", token }),

  // Tables (admin) + live floor map
  adminListTables: (token: string, zoneId?: string) =>
    apiFetch<TableAPI[]>(`/tables${zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : ""}`, { token }),
  adminCreateTable: (token: string, body: TableWriteAPI) =>
    apiFetch<TableAPI>("/tables", { method: "POST", token, body: JSON.stringify(body) }),
  adminUpdateTable: (token: string, id: string, body: TableWriteAPI) =>
    apiFetch<TableAPI>(`/tables/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }),
  adminDeleteTable: (token: string, id: string) =>
    apiFetch<void>(`/tables/${id}`, { method: "DELETE", token }),
  adminFloorMap: (token: string) => apiFetch<FloorZoneAPI[]>("/tables/floor", { token }),
  adminGetTableSession: (token: string, id: string) =>
    apiFetch<TableSessionDetailAPI>(`/table-sessions/${id}`, { token }),
  adminSettleTableSession: (token: string, id: string) =>
    apiFetch<TableSessionDetailAPI>(`/table-sessions/${id}/settle`, { method: "POST", token }),
  // Public — resolve a scanned table QR token.
  resolveTable: (qrToken: string) =>
    apiFetch<ResolveTableAPI>(`/tables/resolve/${encodeURIComponent(qrToken)}`),

  // Pricing / charge policy (admin)
  adminGetChargePolicy: (token: string) =>
    apiFetch<{ charges: ChargeRuleAPI[] }>("/settings/charge-policy", { token }),
  adminUpdateChargePolicy: (token: string, charges: ChargeRuleAPI[]) =>
    apiFetch<{ charges: ChargeRuleAPI[] }>("/settings/charge-policy", {
      method: "PUT",
      token,
      body: JSON.stringify({ charges }),
    }),

  // Service areas (admin)
  adminListServiceAreas: (token: string) =>
    apiFetch<ServiceAreaAPI[]>("/service-areas", { token }),
  adminCreateServiceArea: (token: string, body: ServiceAreaWriteAPI) =>
    apiFetch<ServiceAreaAPI>("/service-areas", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  adminUpdateServiceArea: (token: string, id: string, body: ServiceAreaWriteAPI) =>
    apiFetch<ServiceAreaAPI>(`/service-areas/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  adminDeleteServiceArea: (token: string, id: string) =>
    apiFetch<void>(`/service-areas/${id}`, { method: "DELETE", token }),
};

// Admin types

export interface AdminOrderItemAPI {
  id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  price_at_order: number;
  line_total: number;
  special_instructions: string | null;
}

export interface AnalyticsTopItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface AnalyticsSummaryAPI {
  range: string;
  range_start: string;
  orders_by_status: Record<string, number>;
  total_orders: number;
  revenue_subtotal: number;
  revenue_with_charges: number;
  top_items: AnalyticsTopItem[];
}

// Analytics (richer dashboard)

export interface SplitBucketAPI {
  orders: number;
  revenue: number;
}

export interface ZoneStatAPI {
  zone: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsOverviewAPI {
  range: string;
  range_start: string;
  total_orders: number;
  billable_orders: number;
  orders_by_status: Record<string, number>;
  revenue_subtotal: number;
  revenue_total: number;
  avg_ticket: number;
  split: { dine_in: SplitBucketAPI; parcel: SplitBucketAPI };
  by_zone: ZoneStatAPI[];
  top_items: AnalyticsTopItem[];
  dine_in_sessions: number;
  active_tables: number;
  table_turnover: number;
}

export interface TimeseriesBucketAPI {
  bucket: string;
  orders: number;
  revenue: number;
  dine_in: number;
  parcel: number;
}

export interface PeakHourAPI {
  hour: number;
  orders: number;
  revenue: number;
}

export interface MenuItemCreateAPI {
  id: string;
  name: string;
  category: string;
  price: number;
  currency?: string;
  description?: string | null;
  how_its_made?: string | null;
  taste_profile?: string | null;
  spice_level?: string | null;
  serving?: string | null;
  dietary?: string[] | null;
  popularity?: number | null;
  popularity_note?: string | null;
  image_url?: string | null;
  available?: boolean;
}

export interface MenuItemPatchAPI {
  name?: string;
  description?: string | null;
  how_its_made?: string | null;
  taste_profile?: string | null;
  category?: string;
  price?: number;
  currency?: string;
  serving?: string | null;
  dietary?: string[] | null;
  spice_level?: string | null;
  popularity?: number | null;
  popularity_note?: string | null;
  image_url?: string | null;
  available?: boolean;
}

export interface AdminOrderAPI {
  id: string;
  status: string;
  order_type: string;
  created_at: string;
  confirmed_at: string | null;
  served_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
  customer_email: string;
  customer_name: string;
  customer_code: string | null;
  contact_phone: string | null;
  delivery_address: string | null;
  delivery_area: string | null;
  delivery_pincode: string | null;
  table_id: string | null;
  table_label: string | null;
  table_session_id: string | null;
  zone_name: string | null;
  is_ac: boolean | null;
  next_statuses: string[];
  item_count: number;
  subtotal: number;
  charges: BillCharge[];
  total: number;
  items: AdminOrderItemAPI[];
}

// Zones, tables, floor map (dine-in)

export interface ZoneAPI {
  id: string;
  name: string;
  is_ac: boolean;
  display_order: number;
  active: boolean;
  created_at: string;
}

export interface ZoneWriteAPI {
  name?: string;
  is_ac?: boolean;
  display_order?: number;
  active?: boolean;
}

export interface TableAPI {
  id: string;
  zone_id: string;
  label: string;
  seats: number;
  pos_x: number | null;
  pos_y: number | null;
  qr_token: string;
  status: string;
  active: boolean;
  created_at: string;
}

export interface TableWriteAPI {
  zone_id?: string;
  label?: string;
  seats?: number;
  pos_x?: number | null;
  pos_y?: number | null;
  status?: string;
  active?: boolean;
}

export interface FloorSessionAPI {
  id: string;
  status: string;
  opened_at: string | null;
  party_size: number | null;
  order_count: number;
  running_total: number;
}

export interface FloorTableAPI {
  id: string;
  label: string;
  seats: number;
  pos_x: number | null;
  pos_y: number | null;
  qr_token: string;
  status: string;
  active: boolean;
  session: FloorSessionAPI | null;
}

export interface FloorZoneAPI {
  id: string;
  name: string;
  is_ac: boolean;
  display_order: number;
  active: boolean;
  tables: FloorTableAPI[];
}

export interface TableSessionOrderAPI {
  id: string;
  status: string;
  items: { name: string; quantity: number; line_total: number }[];
  subtotal: number;
  charges: BillCharge[];
  total: number;
}

export interface TableSessionDetailAPI {
  id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  party_size: number | null;
  table_label: string | null;
  zone_name: string | null;
  is_ac: boolean;
  orders: TableSessionOrderAPI[];
  grand_subtotal: number;
  grand_total: number;
}

export interface ResolveTableAPI {
  table_id: string;
  label: string;
  seats: number;
  zone_id: string | null;
  zone_name: string | null;
  is_ac: boolean;
}

export interface ChargeRuleAPI {
  key: string;
  label: string;
  rate: number;
  applies_to: "all" | "dine_in" | "parcel";
  ac_only: boolean;
}

// Customers (parcel callers)

export interface CustomerAPI {
  id: string;
  code: string;
  phone: string | null;
  name: string | null;
  address_line: string | null;
  area: string | null;
  pincode: string | null;
  landmark: string | null;
  preferences: string | null;
  allergies: string | null;
  notes: string | null;
  order_count: number;
  last_order_at: string | null;
  created_at: string;
}

export interface CustomerWriteAPI {
  name?: string | null;
  phone?: string | null;
  address_line?: string | null;
  area?: string | null;
  pincode?: string | null;
  landmark?: string | null;
  preferences?: string | null;
  allergies?: string | null;
  notes?: string | null;
}

export interface CustomerOrderSummaryAPI {
  id: string;
  status: string;
  created_at: string;
  item_count: number;
  subtotal: number;
  total: number;
}

// Service areas (delivery allowlist)

export interface ServiceAreaAPI {
  id: string;
  name: string;
  pincode: string | null;
  aliases: string[] | null;
  active: boolean;
  created_at: string;
}

export interface ServiceAreaWriteAPI {
  name?: string;
  pincode?: string | null;
  aliases?: string[] | null;
  active?: boolean;
}
