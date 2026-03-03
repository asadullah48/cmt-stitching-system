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
} from "./types";

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
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardService = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await api.get<DashboardSummary>("/dashboard/summary");
    return data;
  },
};
