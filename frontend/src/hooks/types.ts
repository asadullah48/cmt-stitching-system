// ─── Auth ───────────────────────────────────────────────────────────────────

export type Role = "admin" | "operator" | "accountant";

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ─── Party ──────────────────────────────────────────────────────────────────

export interface Party {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface PartyCreate {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
}

export type PartyUpdate = Partial<PartyCreate>;

// ─── Orders ─────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending"
  | "stitching_in_progress"
  | "stitching_complete"
  | "packing_in_progress"
  | "packing_complete"
  | "dispatched";

export interface OrderItem {
  id: string;
  size: string;
  quantity: number;
  completed_quantity: number;
  packed_quantity: number;
}

export interface OrderItemCreate {
  size: string;
  quantity: number;
}

export interface Order {
  id: string;
  order_number: string;
  party_id: string | null;
  party_name: string | null;
  party_reference: string | null;
  goods_description: string;
  total_quantity: number;
  stitch_rate_party: number;
  stitch_rate_labor: number;
  pack_rate_party: number | null;
  pack_rate_labor: number | null;
  status: OrderStatus;
  entry_date: string;
  arrival_date: string | null;
  delivery_date: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderCreate {
  party_id?: string;
  party_reference?: string;
  goods_description: string;
  total_quantity: number;
  stitch_rate_party: number;
  stitch_rate_labor: number;
  pack_rate_party?: number;
  pack_rate_labor?: number;
  entry_date: string;
  arrival_date?: string;
  delivery_date?: string;
  items: OrderItemCreate[];
}

export type OrderUpdate = Partial<Omit<OrderCreate, "items">>;

export interface OrderStatusUpdate {
  status: OrderStatus;
}

// ─── Production ─────────────────────────────────────────────────────────────

export type Department = "stitching" | "packing";

export interface ProductionSession {
  id: string;
  order_id: string;
  order_number: string;
  department: Department;
  session_date: string;
  machines_used: number;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  notes: string | null;
  created_at: string;
}

export interface ProductionSessionCreate {
  order_id: string;
  department: Department;
  session_date: string;
  machines_used: number;
  start_time?: string;
  end_time?: string;
  duration_hours?: number;
  notes?: string;
}

// ─── Financial ──────────────────────────────────────────────────────────────

export type TransactionType = "income" | "payment" | "expense" | "adjustment";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "other";

export interface FinancialTransaction {
  id: string;
  party_id: string | null;
  party_name: string | null;
  order_id: string | null;
  transaction_type: TransactionType;
  amount: number;
  payment_method: PaymentMethod | null;
  reference_number: string | null;
  description: string;
  transaction_date: string;
  created_at: string;
}

export interface TransactionCreate {
  party_id?: string;
  order_id?: string;
  transaction_type: TransactionType;
  amount: number;
  payment_method?: PaymentMethod;
  reference_number?: string;
  description: string;
  transaction_date: string;
}

export interface PartyLedgerResponse {
  party: Party;
  transactions: FinancialTransaction[];
  balance: number;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_orders: number;
  pending_orders: number;
  stitching_in_progress: number;
  stitching_complete: number;
  packing_in_progress: number;
  packing_complete: number;
  dispatched: number;
  total_revenue_month: number;
  recent_orders: Order[];
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface OrderFilters {
  status?: OrderStatus;
  party_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}

export interface TransactionFilters {
  party_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}
