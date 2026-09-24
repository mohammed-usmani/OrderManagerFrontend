export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Fired when any apiFetch call receives a 401 — components can subscribe to force-logout. */
export const onUnauthorized: Array<() => void> = [];

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const rest = options ?? {};
  const headers: Record<string, string> = {
    // FormData bodies need the browser to set the multipart boundary itself.
    ...(rest.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    // Bypass ngrok's HTML interstitial so tunneled API calls return JSON, not
    // the "You are about to visit…" page. Harmless on non-ngrok backends.
    "ngrok-skip-browser-warning": "true",
    ...(rest.headers as Record<string, string>),
  };
  // Auth is the httpOnly session cookie; the browser attaches it, JS never sees it.
  const res = await fetch(`${API_URL}${path}`, { ...rest, headers, credentials: "include" });

  // Missing / expired session — notify subscribers so they can clear auth state.
  if (res.status === 401) {
    onUnauthorized.forEach((fn) => fn());
    throw new Error("Session expired. Please sign in again.");
  }

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
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected response from server (HTTP ${res.status})`);
  }
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
  track_stock?: boolean;
  stock_qty?: number | null;
  is_86?: boolean;
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
  order_type: string;
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
  getOrders: () => apiFetch<OrderAPI[]>("/orders"),
  getOrder: (id: string) => apiFetch<OrderAPI>(`/orders/${id}`),
  // Public — the voice line is open to anyone; tickets are always anonymous.
  getWsTicket: (timezone?: string, tableToken?: string) =>
    apiFetch<{ ticket: string }>("/auth/ws-ticket", {
      method: "POST",
      body: JSON.stringify({
        timezone: timezone ?? null,
        table_token: tableToken ?? null,
      }),
    }),

  // Admin
  adminListOrders: (status: string = "active") =>
    apiFetch<AdminOrderAPI[]>(`/admin/orders?status=${encodeURIComponent(status)}`),
  adminUpdateOrderStatus: (orderId: string, status: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  adminCancelOrder: (orderId: string, reason?: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  adminVoidOrderItem: (orderId: string, orderItemId: string, reason: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/void-item`, {
      method: "POST",
      body: JSON.stringify({ order_item_id: orderItemId, reason }),
    }),
  adminSetItemStatus: (orderId: string, orderItemId: string, status: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/item-status`, {
      method: "PATCH",
      body: JSON.stringify({ order_item_id: orderItemId, status }),
    }),
  adminRefundOrder: (orderId: string, reason: string) =>
    apiFetch<AdminOrderAPI>(`/admin/orders/${orderId}/refund`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  adminAnalyticsSummary: (range: "today" | "7d" | "30d" | "all" = "today") =>
    apiFetch<AnalyticsSummaryAPI>(`/admin/analytics/summary?range=${range}`),
  adminAnalyticsOverview: (range = "today") =>
    apiFetch<AnalyticsOverviewAPI>(`/admin/analytics/overview?range=${range}`),
  adminAnalyticsTimeseries: (range = "30d", granularity = "day") =>
    apiFetch<TimeseriesBucketAPI[]>(
      `/admin/analytics/timeseries?range=${range}&granularity=${granularity}`,
    ),
  adminAnalyticsPeakHours: (range = "30d") =>
    apiFetch<PeakHourAPI[]>(`/admin/analytics/peak-hours?range=${range}`),
  adminListMenu: () =>
    apiFetch<MenuItemAPI[]>("/admin/menu"),
  // Menu CRUD (admin)
  adminCreateMenuItem: (body: MenuItemCreateAPI) =>
    apiFetch<MenuItemAPI>("/menu", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateMenuItem: (id: string, body: MenuItemPatchAPI) =>
    apiFetch<MenuItemAPI>(`/menu/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminDisableMenuItem: (id: string) =>
    apiFetch<void>(`/menu/${id}`, {
      method: "DELETE",
    }),
  adminUploadMenuImage: async (file: File) => {
    // Multipart upload — must NOT set Content-Type (browser adds the boundary).
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ image_url: string }>("/menu/upload-image", { method: "POST", body: form });
  },

  // Customers (admin)
  adminListCustomers: (opts: { search?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.search) p.set("search", opts.search);
    p.set("limit", String(opts.limit ?? 20));
    p.set("offset", String(opts.offset ?? 0));
    return apiFetch<CustomerPageAPI>(`/customers?${p.toString()}`);
  },
  adminGetCustomerOrders: (id: string) =>
    apiFetch<CustomerOrderSummaryAPI[]>(`/customers/${id}/orders`),
  adminCreateCustomer: (body: CustomerWriteAPI) =>
    apiFetch<CustomerAPI>("/customers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateCustomer: (id: string, body: CustomerWriteAPI) =>
    apiFetch<CustomerAPI>(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // Floors (admin)
  adminListFloors: () => apiFetch<FloorAPI[]>("/floors"),
  adminCreateFloor: (body: FloorWriteAPI) =>
    apiFetch<FloorAPI>("/floors", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateFloor: (id: string, body: FloorWriteAPI) =>
    apiFetch<FloorAPI>(`/floors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDeleteFloor: (id: string) =>
    apiFetch<void>(`/floors/${id}`, { method: "DELETE" }),

  adminCreateZone: (body: ZoneWriteAPI) =>
    apiFetch<ZoneAPI>("/zones", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateZone: (id: string, body: ZoneWriteAPI) =>
    apiFetch<ZoneAPI>(`/zones/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDeleteZone: (id: string) =>
    apiFetch<void>(`/zones/${id}`, { method: "DELETE" }),

  adminCreateTable: (body: TableWriteAPI) =>
    apiFetch<TableAPI>("/tables", { method: "POST", body: JSON.stringify(body) }),
  adminDeleteTable: (id: string) =>
    apiFetch<void>(`/tables/${id}`, { method: "DELETE" }),
  adminFloorMap: () => apiFetch<FloorMapFloorAPI[]>("/tables/floor"),
  adminSaveTablePositions: (tables: TablePositionAPI[]) =>
    apiFetch<{ updated: number }>("/tables/positions", {
      method: "PATCH",
      body: JSON.stringify({ tables }),
    }),
  adminGetTableSession: (id: string) =>
    apiFetch<TableSessionDetailAPI>(`/table-sessions/${id}`),
  adminSettleTableSession: (id: string) =>
    apiFetch<TableSessionDetailAPI>(`/table-sessions/${id}/settle`, { method: "POST" }),
  // Public — resolve a scanned table QR token.
  resolveTable: (qrToken: string) =>
    apiFetch<ResolveTableAPI>(`/tables/resolve/${encodeURIComponent(qrToken)}`),

  // Pricing / charge policy (admin)
  adminGetChargePolicy: () =>
    apiFetch<{ charges: ChargeRuleAPI[] }>("/settings/charge-policy"),
  adminUpdateChargePolicy: (charges: ChargeRuleAPI[]) =>
    apiFetch<{ charges: ChargeRuleAPI[] }>("/settings/charge-policy", {
      method: "PUT",
      body: JSON.stringify({ charges }),
    }),

  // Staff (owner/manager)
  adminListStaff: () => apiFetch<StaffAPI[]>("/staff"),
  adminCreateStaff: (body: { email: string; name: string; password: string; role: string },
  ) =>
    apiFetch<StaffAPI>("/staff", { method: "POST", body: JSON.stringify(body) }),
  adminUpdateStaffRole: (id: string, role: string) =>
    apiFetch<StaffAPI>(`/staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  adminDeleteStaff: (id: string) =>
    apiFetch<void>(`/staff/${id}`, { method: "DELETE" }),

  // Guest (dine-in, public by QR token)
  guestTab: (qrToken: string) =>
    apiFetch<GuestTabAPI>(`/tables/tab/${encodeURIComponent(qrToken)}`),
  guestCallWaiter: (qrToken: string) =>
    apiFetch<{ ok: boolean }>(`/tables/call/${encodeURIComponent(qrToken)}`, { method: "POST" }),

  // Payments
  getPaymentConfig: () =>
    apiFetch<{ razorpay_enabled: boolean; key_id: string }>("/payments/config"),
  paymentQuote: (body: PaymentTargetAPI) =>
    apiFetch<{ amount_due: number }>("/payments/quote", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Public for guests; a staff session cookie lets the server accept a discount. */
  createRazorpayCheckout: (body: PaymentTargetAPI) =>
    apiFetch<RazorpayCheckoutAPI>("/payments/razorpay/order", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyRazorpay: (body: {
    provider_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    apiFetch<{ status: string; amount: number }>("/payments/razorpay/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  settleCash: (body: PaymentTargetAPI) =>
    apiFetch<{ status: string; amount: number; method: string }>("/payments/cash", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Restaurant profile (public GET; admin PUT)
  getRestaurantProfile: () =>
    apiFetch<RestaurantProfileAPI>("/settings/restaurant"),
  adminUpdateRestaurantProfile: (profile: RestaurantProfileAPI) =>
    apiFetch<RestaurantProfileAPI>("/settings/restaurant", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),

  // Service areas (admin)
  adminListServiceAreas: () =>
    apiFetch<ServiceAreaAPI[]>("/service-areas"),
  adminCreateServiceArea: (body: ServiceAreaWriteAPI) =>
    apiFetch<ServiceAreaAPI>("/service-areas", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdateServiceArea: (id: string, body: ServiceAreaWriteAPI) =>
    apiFetch<ServiceAreaAPI>(`/service-areas/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminDeleteServiceArea: (id: string) =>
    apiFetch<void>(`/service-areas/${id}`, { method: "DELETE" }),
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
  status?: "pending" | "ready" | "served" | "voided";
  void_reason?: string | null;
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

export interface FloorStatAPI {
  floor: string;
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
  by_floor: FloorStatAPI[];
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
  track_stock?: boolean;
  stock_qty?: number | null;
  is_86?: boolean;
}

/** Canonical order lifecycle states (mirrors the backend state machine). */
export type OrderStatus =
  | "cart"
  | "confirmed"
  | "cooking"
  | "ready"
  | "served"
  | "delivered"
  | "awaiting_payment"
  | "paid"
  | "cancelled";

export interface AdminOrderAPI {
  id: string;
  status: OrderStatus;
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
  floor_name: string | null;
  is_ac: boolean | null;
  next_statuses: OrderStatus[];
  item_count: number;
  subtotal: number;
  charges: BillCharge[];
  total: number;
  items: AdminOrderItemAPI[];
  refunded?: boolean;
  cancellation_reason?: string | null;
}

// Floors, zones, tables, floor map (dine-in)

export interface FloorAPI {
  id: string;
  name: string;
  display_order: number;
  active: boolean;
  width: number;
  height: number;
  created_at: string;
}

export interface FloorWriteAPI {
  name?: string;
  display_order?: number;
  active?: boolean;
  width?: number;
  height?: number;
}

export interface ZoneAPI {
  id: string;
  floor_id: string | null;
  name: string;
  is_ac: boolean;
  display_order: number;
  active: boolean;
  created_at: string;
  /** Top-left corner on the logical canvas (default 1000×640) */
  pos_x: number | null;
  pos_y: number | null;
  width: number | null;
  height: number | null;
}

export interface ZoneWriteAPI {
  name?: string;
  floor_id?: string | null;
  is_ac?: boolean;
  display_order?: number;
  active?: boolean;
  pos_x?: number | null;
  pos_y?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface TableAPI {
  id: string;
  zone_id: string;
  label: string;
  seats: number;
  pos_x: number | null;
  pos_y: number | null;
  shape: TableShape | null;
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
  shape?: TableShape | null;
  status?: string;
  active?: boolean;
}

export interface TablePositionAPI {
  table_id: string;
  pos_x?: number | null;
  pos_y?: number | null;
  shape?: string | null;
  zone_id?: string | null;
}

export interface FloorSessionAPI {
  id: string;
  status: string;
  opened_at: string | null;
  party_size: number | null;
  order_count: number;
  running_total: number;
}

/** Table render shapes & live statuses (single source of truth for pickers). */
export type TableShape = "round" | "square" | "rect";
export type TableStatus = "free" | "occupied" | "needs_bill" | "cleaning";

export const SHAPE_OPTIONS: { value: TableShape; label: string }[] = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rect", label: "Rectangle" },
];

export interface FloorTableAPI {
  id: string;
  label: string;
  seats: number;
  pos_x: number | null;
  pos_y: number | null;
  shape: TableShape | null;
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
  /** Zone region top-left and size on the logical 1000×640 canvas */
  pos_x: number | null;
  pos_y: number | null;
  width: number | null;
  height: number | null;
  tables: FloorTableAPI[];
}

/** Full floor plan returned by GET /tables/floor */
export interface FloorMapFloorAPI {
  id: string | null;
  name: string;
  display_order: number;
  active: boolean;
  width: number;
  height: number;
  zones: FloorZoneAPI[];
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
  floor_name: string | null;
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
  floor_id: string | null;
  floor_name: string | null;
}

export interface ChargeRuleAPI {
  key: string;
  label: string;
  rate: number;
  applies_to: "all" | "dine_in" | "parcel";
  ac_only: boolean;
}

export interface GuestTabAPI {
  open: boolean;
  session_id?: string;
  table_label?: string;
  grand_subtotal?: number;
  grand_total?: number;
  orders?: {
    id: string;
    status: string;
    items: { name: string; quantity: number; line_total: number }[];
  }[];
}

export interface PaymentTargetAPI {
  order_id?: string;
  session_id?: string;
  tip?: number;
  discount?: number;
}

export interface RazorpayCheckoutAPI {
  provider_order_id: string;
  amount: number;
  amount_paise: number;
  currency: string;
  key_id: string;
  payment_id: string;
}

export interface StaffAPI {
  id: string;
  email: string;
  name: string;
  role: string;
  is_admin: boolean;
  created_at: string;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface HoursWindowAPI {
  open: string; // HH:MM (24h)
  close: string;
}
export interface RestaurantProfileAPI {
  name: string;
  legal_name: string;
  cuisine: string;
  tagline: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  fssai: string;
  currency: string;
  timezone: string;
  hours: Record<Weekday, HoursWindowAPI[]>;
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

export interface CustomerPageAPI {
  items: CustomerAPI[];
  total: number;
  limit: number;
  offset: number;
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
