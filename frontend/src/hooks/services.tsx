import axios from "axios";
import type {
  TokenResponse,
  PaginatedResponse,
  Order,
  OrderCreate,
  OrderUpdate,
  OrderStatusUpdate,
  OrderFilters,
  Party,
  PartyCreate,
  PartyUpdate,
  PartyLedgerResponse,
  ProductionSession,
  ProductionSessionCreate,
  FinancialTransaction,
  TransactionCreate,
  TransactionFilters,
  DashboardSummary,
  QualityReport,
  QualityCheckpoint,
  DefectLog,
  DispatchOrder,
  InventoryCategory,
  InventoryItem,
  InventoryItemCreate,
  InventoryItemUpdate,
  StockAdjustment,
  InventoryListResponse,
  Product,
  ProductBOMItem,
  OrderMaterials,
  Alert,
  AppSettings,
  Expense,
} from "./types";

export type { Alert, AppSettings };

// ─── Axios instance ──────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api/v1",
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token from localStorage before every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("cmt_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// On 401, clear credentials and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("cmt_token");
      localStorage.removeItem("cmt_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authService = {
  login: async (username: string, password: string): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/login", {
      username,
      password,
    });
    return data;
  },

  register: async (
    username: string,
    email: string,
    password: string
  ): Promise<TokenResponse> => {
    const { data } = await api.post<TokenResponse>("/auth/register", {
      username,
      email,
      password,
    });
    return data;
  },

  me: async (): Promise<TokenResponse["user"]> => {
    const { data } = await api.get("/auth/me");
    return data;
  },
};

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ordersService = {
  getOrders: async (
    filters: OrderFilters = {}
  ): Promise<PaginatedResponse<Order>> => {
    const { data } = await api.get<PaginatedResponse<Order>>("/orders/", {
      params: filters,
    });
    return data;
  },

  getOrder: async (id: string): Promise<Order> => {
    const { data } = await api.get<Order>(`/orders/${id}`);
    return data;
  },

  createOrder: async (payload: OrderCreate): Promise<Order> => {
    const { data } = await api.post<Order>("/orders/", payload);
    return data;
  },

  updateOrder: async (id: string, payload: OrderUpdate): Promise<Order> => {
    const { data } = await api.put<Order>(`/orders/${id}`, payload);
    return data;
  },

  updateStatus: async (
    id: string,
    payload: OrderStatusUpdate
  ): Promise<Order> => {
    const { data } = await api.patch<Order>(`/orders/${id}/status`, payload);
    return data;
  },

  deleteOrder: async (id: string): Promise<void> => {
    await api.delete(`/orders/${id}`);
  },

  cloneOrder: async (id: string): Promise<Order> => {
    const { data } = await api.post<Order>(`/orders/${id}/clone`);
    return data;
  },

  bulkImport: async (file: File): Promise<{ created: number; errors: Array<{ row: number; message: string }> }> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { created: 0, errors: [{ row: 0, message: "File is empty or has no data rows" }] };

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((line, i) => {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });

      const qty = parseInt(obj.total_quantity) || 0;
      return {
        order_date: obj.entry_date || obj.order_date || new Date().toISOString().split("T")[0],
        party_name: obj.party_name || "",
        goods_description: obj.goods_description || "",
        total_quantity: qty,
        stitch_rate_party: parseFloat(obj.stitch_rate_party) || 0,
        stitch_rate_labor: parseFloat(obj.stitch_rate_labor) || 0,
        pack_rate_party: obj.pack_rate_party ? parseFloat(obj.pack_rate_party) : undefined,
        pack_rate_labor: obj.pack_rate_labor ? parseFloat(obj.pack_rate_labor) : undefined,
        items: [{ size: "OS", quantity: qty }],
      };
    }).filter((r) => r.party_name && r.goods_description);

    const res = await api.post<{ created: number; errors: Array<{ row: number; party?: string; reason?: string; message?: string }> }>(
      "/orders/bulk-import",
      rows
    );
    const errors = (res.data.errors ?? []).map((e) => ({
      row: e.row,
      message: e.reason ?? e.message ?? "Unknown error",
    }));
    return { created: res.data.created, errors };
  },
};

// ─── Parties ─────────────────────────────────────────────────────────────────

export const partiesService = {
  getParties: async (
    page = 1,
    size = 50
  ): Promise<PaginatedResponse<Party>> => {
    const { data } = await api.get<PaginatedResponse<Party>>("/parties/", {
      params: { page, size },
    });
    return data;
  },

  getParty: async (id: string): Promise<Party> => {
    const { data } = await api.get<Party>(`/parties/${id}`);
    return data;
  },

  createParty: async (payload: PartyCreate): Promise<Party> => {
    const { data } = await api.post<Party>("/parties/", payload);
    return data;
  },

  updateParty: async (id: string, payload: PartyUpdate): Promise<Party> => {
    const { data } = await api.put<Party>(`/parties/${id}`, payload);
    return data;
  },

  deleteParty: async (id: string): Promise<void> => {
    await api.delete(`/parties/${id}`);
  },

  getPartyLedger: async (id: string): Promise<PartyLedgerResponse> => {
    const { data } = await api.get<PartyLedgerResponse>(
      `/parties/${id}/ledger`
    );
    return data;
  },
};

// ─── Production ──────────────────────────────────────────────────────────────

export const productionService = {
  logSession: async (
    payload: ProductionSessionCreate
  ): Promise<ProductionSession> => {
    const { data } = await api.post<ProductionSession>("/production/", payload);
    return data;
  },

  getSessionsForOrder: async (
    orderId: string,
    department?: "stitching" | "packing"
  ): Promise<ProductionSession[]> => {
    const { data } = await api.get<ProductionSession[]>(
      `/production/${orderId}`,
      { params: department ? { department } : {} }
    );
    return data;
  },
};

// ─── Transactions ────────────────────────────────────────────────────────────

export const transactionsService = {
  getTransactions: async (
    filters: TransactionFilters = {}
  ): Promise<PaginatedResponse<FinancialTransaction>> => {
    const { data } = await api.get<PaginatedResponse<FinancialTransaction>>(
      "/transactions/",
      { params: filters }
    );
    return data;
  },

  createTransaction: async (
    payload: TransactionCreate
  ): Promise<FinancialTransaction> => {
    const { data } = await api.post<FinancialTransaction>(
      "/transactions/",
      payload
    );
    return data;
  },

  updateTransaction: async (
    id: string,
    payload: TransactionCreate
  ): Promise<FinancialTransaction> => {
    const { data } = await api.put<FinancialTransaction>(
      `/transactions/${id}`,
      payload
    );
    return data;
  },

  deleteTransaction: async (id: string): Promise<void> => {
    await api.delete(`/transactions/${id}`);
  },

  linkToBill: async (txId: string, billId: string | null): Promise<FinancialTransaction> => {
    const { data } = await api.patch<FinancialTransaction>(
      `/transactions/${txId}/link-bill`,
      { bill_id: billId }
    );
    return data;
  },
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardService = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await api.get<DashboardSummary>("/dashboard/summary");
    return data;
  },
};

// ─── Quality ─────────────────────────────────────────────────────────────────

export const qualityService = {
  getReport: async (orderId: string): Promise<QualityReport> => {
    const { data } = await api.get<QualityReport>(`/quality/${orderId}`);
    return data;
  },
  updateCheckpoint: async (checkpointId: string, passed: boolean, notes?: string): Promise<QualityCheckpoint> => {
    const { data } = await api.patch<QualityCheckpoint>(`/quality/checkpoints/${checkpointId}`, { passed, notes });
    return data;
  },
  logDefect: async (orderId: string, defectType: string, quantity: number, notes?: string): Promise<DefectLog> => {
    const { data } = await api.post<DefectLog>(`/quality/defects`, {
      order_id: orderId, defect_type: defectType, quantity, notes,
    });
    return data;
  },
};

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryService = {
  getCategories: async (): Promise<InventoryCategory[]> => {
    const { data } = await api.get<InventoryCategory[]>("/inventory/categories");
    return data;
  },

  createCategory: async (name: string, category_type: string): Promise<InventoryCategory> => {
    const { data } = await api.post<InventoryCategory>("/inventory/categories", { name, category_type });
    return data;
  },

  getItems: async (params: {
    page?: number;
    size?: number;
    category_type?: string;
    search?: string;
  } = {}): Promise<InventoryListResponse> => {
    const { data } = await api.get<InventoryListResponse>("/inventory/items", { params });
    return data;
  },

  createItem: async (payload: InventoryItemCreate): Promise<InventoryItem> => {
    const { data } = await api.post<InventoryItem>("/inventory/items", payload);
    return data;
  },

  updateItem: async (id: string, payload: InventoryItemUpdate): Promise<InventoryItem> => {
    const { data } = await api.put<InventoryItem>(`/inventory/items/${id}`, payload);
    return data;
  },

  deleteItem: async (id: string): Promise<void> => {
    await api.delete(`/inventory/items/${id}`);
  },

  adjustStock: async (id: string, payload: StockAdjustment): Promise<InventoryItem> => {
    const { data } = await api.patch<InventoryItem>(`/inventory/items/${id}/adjust`, payload);
    return data;
  },
};

// ─── Dispatch ────────────────────────────────────────────────────────────────

export const dispatchService = {
  getCarriers: async (): Promise<string[]> => {
    const { data } = await api.get<string[]>("/dispatch/carriers");
    return data;
  },
  getReadyOrders: async (): Promise<DispatchOrder[]> => {
    const { data } = await api.get<DispatchOrder[]>("/dispatch/ready");
    return data;
  },
  updateDispatch: async (orderId: string, payload: Partial<DispatchOrder>): Promise<DispatchOrder> => {
    const { data } = await api.patch<DispatchOrder>(`/dispatch/${orderId}`, payload);
    return data;
  },
};

// ─── Bills ───────────────────────────────────────────────────────────────────

export interface BillOrderItem {
  size: string;
  quantity: number;
  stitch_rate: number;
  pack_rate: number;
  amount: number;
  description: string;
}

export interface Bill {
  id: string;
  bill_number: string;
  bill_series: string;
  bill_sequence: number;
  order_id: string;
  order_number?: string;
  party_id?: string;
  party_name?: string;
  party_contact_person?: string;
  party_phone?: string;
  party_address?: string;
  bill_date: string;
  carrier?: string;
  tracking_number?: string;
  carton_count?: number;
  total_weight?: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  amount_due: number;
  amount_paid: number;
  amount_outstanding: number;
  discount: number;
  previous_balance: number;
  subtotal: number;
  order_items: BillOrderItem[];
  notes?: string;
}

export interface BillCreate {
  order_id: string;
  bill_number?: string;
  bill_series?: string;
  bill_date: string;
  carrier?: string;
  tracking_number?: string;
  carton_count?: number;
  total_weight?: number;
  amount_due: number;
  discount?: number;
  notes?: string;
}

export interface BillPaymentUpdate {
  amount: number;
  payment_method?: string;
  notes?: string;
}

export const billService = {
  list: async (params?: Record<string, string | number | undefined>): Promise<{ data: Bill[]; total: number; page: number; size: number }> => {
    const { data } = await api.get<{ data: Bill[]; total: number; page: number; size: number }>('/bills/', { params });
    return data;
  },

  getById: async (id: string): Promise<Bill> => {
    const { data } = await api.get<Bill>(`/bills/${id}`);
    return data;
  },

  create: async (payload: BillCreate): Promise<Bill> => {
    const { data } = await api.post<Bill>('/bills/', payload);
    return data;
  },

  recordPayment: async (id: string, payload: BillPaymentUpdate): Promise<Bill> => {
    const { data } = await api.patch<Bill>(`/bills/${id}/payment`, payload);
    return data;
  },

  nextNumber: async (series: string): Promise<{ series: string; next_number: string; next_sequence: number }> => {
    const { data } = await api.get<{ series: string; next_number: string; next_sequence: number }>(
      `/bills/next-number`,
      { params: { series } }
    );
    return data;
  },

  getByOrder: async (orderId: string): Promise<Bill | null> => {
    const res = await billService.list({ order_id: orderId, size: 1 });
    return res.data[0] ?? null;
  },

  update: async (id: string, payload: Partial<BillCreate>): Promise<Bill> => {
    const { data } = await api.patch<Bill>(`/bills/${id}`, payload);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/bills/${id}`);
  },
};

// ─── Expenses ────────────────────────────────────────────────────────────────

export const expensesService = {
  listByOrder: async (orderId: string): Promise<{ data: Expense[]; total: number }> => {
    const { data } = await api.get('/expenses/', { params: { order_id: orderId, size: 100 } });
    return data;
  },
  create: async (payload: {
    order_id?: string;
    amount: number;
    description?: string;
    expense_date: string;
    receipt_number?: string;
  }): Promise<Expense> => {
    const { data } = await api.post<Expense>('/expenses/', payload);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/expenses/${id}`);
  },
};

// ─── Insights ────────────────────────────────────────────────────────────────

export const insightsService = {
  getAlerts: async (): Promise<Alert[]> => {
    const { data } = await api.get<Alert[]>('/insights/');
    return data;
  },
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsService = {
  get: async (): Promise<AppSettings> => {
    const { data } = await api.get<AppSettings>('/settings/');
    return data;
  },
  update: async (payload: Partial<AppSettings>): Promise<AppSettings> => {
    const { data } = await api.put<AppSettings>('/settings/', payload);
    return data;
  },
};

// ─── Products / BOM ───────────────────────────────────────────────────────────

export const productService = {
  getProducts: () =>
    api.get<Product[]>("/products").then((r) => r.data),

  createProduct: (data: { name: string; description?: string; image_url?: string }) =>
    api.post<Product>("/products", data).then((r) => r.data),

  updateProduct: (id: string, data: { name?: string; description?: string; image_url?: string }) =>
    api.put<Product>(`/products/${id}`, data).then((r) => r.data),

  deleteProduct: (id: string) =>
    api.delete(`/products/${id}`),

  addBOMItem: (productId: string, data: {
    inventory_item_id: string;
    material_quantity: number;
    covers_quantity: number;
    department: string;
    notes?: string;
  }) => api.post<ProductBOMItem>(`/products/${productId}/bom`, data).then((r) => r.data),

  deleteBOMItem: (bomItemId: string) =>
    api.delete(`/products/bom/${bomItemId}`),

  getOrderMaterials: (orderId: string) =>
    api.get<OrderMaterials>(`/orders/${orderId}/materials`).then((r) => r.data),
};
