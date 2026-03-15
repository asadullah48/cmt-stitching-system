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
  product_id?: string | null;
  product_name?: string | null;
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
  transport_expense: number | null;
  loading_expense: number | null;
  miscellaneous_expense: number | null;
  rent: number | null;
  loading_charges: number | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderCreate {
  party_id?: string;
  party_reference?: string;
  product_id?: string | null;
  goods_description: string;
  total_quantity: number;
  stitch_rate_party: number;
  stitch_rate_labor: number;
  pack_rate_party?: number;
  pack_rate_labor?: number;
  entry_date: string;
  arrival_date?: string;
  delivery_date?: string;
  transport_expense?: number;
  loading_expense?: number;
  miscellaneous_expense?: number;
  rent?: number;
  loading_charges?: number;
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

export type TransactionType = "income" | "payment" | "expense" | "purchase" | "stock_consumption" | "adjustment";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "other";

export interface FinancialTransaction {
  id: string;
  party_id: string | null;
  party_name: string | null;
  order_id: string | null;
  bill_id: string | null;
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
  bill_id?: string;
  transaction_type: TransactionType;
  amount: number;
  payment_method?: PaymentMethod;
  reference_number?: string;
  description: string;
  transaction_date: string;
}

export interface PartyLedgerResponse {
  party_id: string;
  party_name: string;
  balance: number;
  transactions: FinancialTransaction[];
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
  completed_today: number;
  active_orders: number;
  on_hold_orders: number;
  stitching_progress_pct: number;
  packing_progress_pct: number;
  collected_month?: number;
  outstanding_total?: number;
  orders_this_month?: number;
}

// ─── Insights ────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  level: 'warning' | 'info';
  message: string;
  detail?: string;
  link?: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  business_name: string;
  owner_name: string;
  no_bill_alert_days: number;
  goods_on_hold_alert_days: number;
  outstanding_alert_days: number;
  rate_deviation_pct: number;
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
  search?: string;
  page?: number;
  size?: number;
}

export interface TransactionFilters {
  party_id?: string;
  order_id?: string;
  transaction_type?: TransactionType;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}

// ─── Quality ─────────────────────────────────────────────────────────────────

export interface QualityCheckpoint {
  id: string;
  order_id: string;
  checkpoint_name: string;
  passed: boolean;
  checked_at: string | null;
  notes: string | null;
}

export interface DefectLog {
  id: string;
  order_id: string;
  defect_type: string;
  quantity: number;
  notes: string | null;
  logged_at: string;
}

export interface QualityReport {
  order_id: string;
  order_number: string;
  checkpoints: QualityCheckpoint[];
  defects: DefectLog[];
  all_passed: boolean;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type ItemCondition = "good" | "damaged" | "expired";
export type CategoryType = "raw_material" | "finished_goods" | "accessories";

export interface InventoryCategory {
  id: string;
  name: string;
  category_type: CategoryType;
}

export interface InventoryItem {
  id: string;
  category_id: string | null;
  category_name: string | null;
  category_type: CategoryType | null;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  cost_per_unit: number | null;
  location: string | null;
  condition: ItemCondition;
}

export interface InventoryItemCreate {
  category_id?: string;
  name: string;
  sku?: string;
  unit: string;
  current_stock?: number;
  minimum_stock?: number;
  cost_per_unit?: number;
  location?: string;
  condition?: ItemCondition;
}

export type InventoryItemUpdate = Partial<Omit<InventoryItemCreate, "current_stock">>;

export interface StockAdjustment {
  quantity: number;
  notes?: string;
  transaction_date?: string;
  order_number?: string;
  bill_number?: string;
  party_reference?: string;
}

export interface InventoryListResponse {
  data: InventoryItem[];
  total: number;
  page: number;
  size: number;
}

// ─── Product / BOM ────────────────────────────────────────────────────────────

export interface ProductBOMItem {
  id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  inventory_item_unit: string;
  material_quantity: number;
  covers_quantity: number;
  department: "stitching" | "packing";
  notes?: string | null;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  bom_items: ProductBOMItem[];
}

export interface MaterialRequirement {
  inventory_item_id: string;
  inventory_item_name: string;
  unit: string;
  material_quantity: number;
  covers_quantity: number;
  required: number;
  in_stock: number;
  shortfall: number;
  sufficient: boolean;
  department: string;
  notes?: string | null;
}

export interface OrderMaterials {
  product_name: string | null;
  order_quantity: number;
  stitching: MaterialRequirement[];
  packing: MaterialRequirement[];
  stitching_consumed: boolean;
  packing_consumed: boolean;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  category_id?: string;
  order_id?: string;
  amount: number;
  description?: string;
  expense_date: string;
  receipt_number?: string;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export interface DispatchOrder {
  id: string;
  order_number: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  carton_count: number | null;
  total_weight: number | null;
  party_name: string | null;
  goods_description: string;
  total_quantity: number;
}

// ─── Todos ───────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoCategory = "billing" | "maintenance" | "workflow" | "order" | "other";
export type TodoRecurrence = "daily" | "weekly" | "monthly" | "custom";

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  category: TodoCategory;
  due_date: string | null;
  completed_at: string | null;
  order_id: string | null;
  order_number: string | null;
  assigned_to: string | null;
  assigned_username: string | null;
  recurrence: TodoRecurrence | null;
  recurrence_days: number | null;
  parent_todo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoCreate {
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: TodoCategory;
  due_date?: string;
  order_id?: string;
  assigned_to?: string;
  recurrence?: TodoRecurrence;
  recurrence_days?: number;
}

export type TodoUpdate = Partial<TodoCreate>;

export interface TodoListResponse {
  data: Todo[];
  total: number;
}

export interface TodoFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: TodoCategory;
  overdue_only?: boolean;
  page?: number;
  size?: number;
}

// ─── Overhead & Cash ─────────────────────────────────────────────────────────

export type OverheadCategory = "rent" | "wages" | "utilities" | "insurance" | "other";
export type OverheadRecurrence = "monthly" | "weekly" | "custom";
export type OverheadStatus = "unpaid" | "paid";
export type CashEntryType = "credit" | "debit";

export interface CashAccount {
  id: string;
  name: string;
  account_type: "cash" | "bank";
  opening_balance: number;
  current_balance: number;
  note: string | null;
  updated_at: string;
}

export interface CashAccountUpdate {
  opening_balance?: number;
  note?: string;
}

export interface CashEntry {
  id: string;
  account_id: string;
  account_name: string | null;
  entry_type: CashEntryType;
  amount: number;
  description: string;
  entry_date: string;
  source: string | null;
  source_id: string | null;
  created_at: string;
}

export interface CashEntryCreate {
  account_id: string;
  entry_type: CashEntryType;
  amount: number;
  description: string;
  entry_date: string;
  source?: string;
}

export interface CashEntryListResponse {
  data: CashEntry[];
  total: number;
  running_balance: number;
}

export interface OverheadExpense {
  id: string;
  title: string;
  category: OverheadCategory;
  amount: number;
  due_date: string;
  description: string | null;
  status: OverheadStatus;
  paid_date: string | null;
  paid_from_account_id: string | null;
  paid_from_account_name: string | null;
  recurrence: OverheadRecurrence | null;
  recurrence_days: number | null;
  parent_expense_id: string | null;
  created_at: string;
}

export interface OverheadExpenseCreate {
  title: string;
  category?: OverheadCategory;
  amount: number;
  due_date: string;
  description?: string;
  recurrence?: OverheadRecurrence;
  recurrence_days?: number;
}

export type OverheadExpenseUpdate = Partial<OverheadExpenseCreate>;

export interface MarkPaidRequest {
  account_id: string;
  paid_date?: string;
}

export interface OverheadExpenseListResponse {
  data: OverheadExpense[];
  total: number;
}
