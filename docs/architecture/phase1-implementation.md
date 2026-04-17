# Phase 1 Implementation Plan — CMT Stitching + Packing System

**Date:** 2026-03-03
**Scope:** Auth + Orders + Financial Ledger + Production Tracking — Stitching & Packing departments (full-stack)
**Build order within each section:** Models → Migrations → Schemas → Services → Endpoints → Frontend

---

## Current State

### Backend — What exists
- `app/models/` — all model files present and correct
  - `users.py` — has `role` field ✓
  - `parties.py` — **missing `balance` field** (needs patch)
  - `orders.py`, `production.py`, `financial.py` — correct ✓
- `app/core/config.py` — Settings with DATABASE_URL, SECRET_KEY ✓
- `app/core/database.py` — engine, SessionLocal, get_db ✓
- `app/core/security.py` — empty (needs JWT implementation)
- `app/api/v1/endpoints/orders.py` — stub only
- `app/services/order_service.py` — partial stub
- `app/schemas/` — empty directory
- `main.py` — no routers wired

### Frontend — What exists
- All page/component/hook files present but **0 bytes** (empty)
- Next.js 15 App Router with TailwindCSS v4 configured
- Route structure uses `(auth)/` and `pages/` (needs to move to App Router pattern)

---

## Step 1: Fix Models

### 1.1 — `backend/app/models/parties.py`
Add `balance` field (running ledger total, updated on each transaction):

```python
balance = Column(Decimal(10, 2), default=Decimal("0.00"), nullable=False)
```

### 1.2 — `backend/app/models/orders.py`
Add packing rate fields and update order status choices:

```python
# New rate fields
pack_rate_party = Column(Decimal(10, 2), nullable=True)   # party billing rate for packing
pack_rate_labor = Column(Decimal(10, 2), nullable=True)   # labor pay rate for packing

# Status now covers full lifecycle:
# pending | stitching_in_progress | stitching_complete
# packing_in_progress | packing_complete | dispatched
```

Add `packed_quantity` to `OrderItem`:
```python
packed_quantity = Column(Integer, default=0)  # alongside existing completed_quantity (stitching)
```

### 1.3 — `backend/app/models/production.py`
Add department field:

```python
department = Column(String(20), nullable=False, default="stitching")  # "stitching" | "packing"
```

### 1.4 — `backend/app/models/base.py`
Add `deleted_at` soft-delete field to BaseModel:

```python
deleted_at = Column(DateTime, nullable=True)
is_deleted = Column(Boolean, default=False)
```

---

## Step 2: Alembic Setup & Initial Migration

### 2.1 — Initialize Alembic
```bash
cd backend
uv run alembic init alembic
```

Configure `alembic/env.py`:
- Import `Base` from `app.models`
- Set `target_metadata = Base.metadata`
- Load `DATABASE_URL` from settings

### 2.2 — Create initial migration
```bash
uv run alembic revision --autogenerate -m "initial_schema"
uv run alembic upgrade head
```

---

## Step 3: Backend Core — Security & Dependencies

### 3.1 — `backend/app/core/security.py`
Implement:
- `hash_password(password: str) -> str` — bcrypt via passlib
- `verify_password(plain: str, hashed: str) -> bool`
- `create_access_token(data: dict) -> str` — JWT via python-jose
- `decode_token(token: str) -> dict`

### 3.2 — `backend/app/core/deps.py` (new file)
FastAPI dependencies:
- `get_db()` — yields Session
- `get_current_user(token, db)` — decodes JWT, returns User
- `require_role(*roles)` — role guard factory

---

## Step 4: Pydantic Schemas

### 4.1 — `backend/app/schemas/auth.py`
```
LoginRequest(username, password)
TokenResponse(access_token, token_type, user)
UserOut(id, username, email, role)
```

### 4.2 — `backend/app/schemas/parties.py`
```
PartyCreate(name, contact_person?, phone?, email?, address?, payment_terms?)
PartyUpdate — all Optional
PartyOut — full fields + balance
PartyListResponse(data, total, page, size)
```

### 4.3 — `backend/app/schemas/orders.py`
```
OrderItemCreate(size, quantity)
OrderItemOut(size, quantity, completed_quantity, packed_quantity)
OrderCreate(party_id?, party_reference?, goods_description, total_quantity,
            stitch_rate_party, stitch_rate_labor,
            pack_rate_party?, pack_rate_labor?,
            entry_date, arrival_date?, delivery_date?,
            items: list[OrderItemCreate])
OrderUpdate — all Optional except id
OrderStatusUpdate(status)  # validates against full status enum
OrderOut — full order + items + party name
OrderListResponse(data, total, page, size)
```

Status enum:
```
pending | stitching_in_progress | stitching_complete
        | packing_in_progress | packing_complete | dispatched
```

### 4.4 — `backend/app/schemas/production.py`
```
ProductionSessionCreate(order_id, department, session_date, machines_used,
                        start_time?, end_time?, duration_hours?, notes?)
  — department: Literal["stitching", "packing"]
ProductionSessionOut — full fields + order_number + department
ProductionListResponse(data, total, page, size)
```

### 4.5 — `backend/app/schemas/financial.py`
```
TransactionCreate(party_id, order_id?, transaction_type, amount,
                  payment_method?, reference_number?, description, transaction_date)
TransactionOut — full fields + party name
TransactionListResponse(data, total, page, size)
PartyLedgerResponse(party, transactions, balance)
```

### 4.6 — `backend/app/schemas/dashboard.py`
```
DashboardSummary(
  total_orders,
  pending_orders,
  stitching_in_progress,
  stitching_complete,
  packing_in_progress,
  packing_complete,
  dispatched,
  total_revenue_month,
  recent_orders: list[OrderOut]
)
```

---

## Step 5: Services

### 5.1 — `backend/app/services/auth_service.py`
- `authenticate_user(db, username, password) -> User | None`
- `create_user(db, data) -> User`

### 5.2 — `backend/app/services/order_service.py` (complete the stub)
- `create_order(db, data, user_id) -> Order` — generate order number, create items
- `get_orders(db, filters) -> (list[Order], total)` — filter by status/party/date
- `get_order(db, order_id) -> Order`
- `update_order_status(db, order_id, status, user_id) -> Order`

### 5.3 — `backend/app/services/party_service.py`
- `create_party(db, data) -> Party`
- `get_parties(db, page, size) -> (list[Party], total)`
- `get_party_ledger(db, party_id) -> (Party, list[Transaction])`

### 5.4 — `backend/app/services/production_service.py`
- `log_session(db, data, user_id) -> ProductionSession`
  — `data.department` stored on session; updates `completed_quantity` (stitching) or `packed_quantity` (packing) on OrderItems
- `get_sessions_for_order(db, order_id, department?) -> list[ProductionSession]`
  — optional department filter for frontend tab views

### 5.5 — `backend/app/services/financial_service.py`
- `create_transaction(db, data, user_id) -> FinancialTransaction`
  - After insert: update `party.balance`
- `get_transactions(db, filters) -> (list[Transaction], total)`

### 5.6 — `backend/app/services/dashboard_service.py`
- `get_summary(db) -> DashboardSummary`
  — includes counts for both stitching and packing pipeline stages

### 5.7 — `backend/app/services/audit_service.py`
- `log_create(db, table, record_id, data, user_id)`
- `log_update(db, table, record_id, old, new, user_id)`
- `log_delete(db, table, record_id, user_id)`

---

## Step 6: API Endpoints

### 6.1 — `backend/app/api/v1/endpoints/auth.py`
```
POST /auth/login    → TokenResponse
GET  /auth/me       → UserOut
```

### 6.2 — `backend/app/api/v1/endpoints/parties.py`
```
GET  /parties/              → PartyListResponse
POST /parties/              → PartyOut
GET  /parties/{id}          → PartyOut
PUT  /parties/{id}          → PartyOut
GET  /parties/{id}/ledger   → PartyLedgerResponse
```

### 6.3 — `backend/app/api/v1/endpoints/orders.py` (replace stub)
```
GET    /orders/             → OrderListResponse  (filter: status, party_id, date_from, date_to)
POST   /orders/             → OrderOut
GET    /orders/{id}         → OrderOut
PUT    /orders/{id}         → OrderOut
PATCH  /orders/{id}/status  → OrderOut
DELETE /orders/{id}         → 204 (soft delete)
```

### 6.4 — `backend/app/api/v1/endpoints/production.py`
```
POST /production/                               → ProductionSessionOut
GET  /production/{order_id}                     → list[ProductionSessionOut]
GET  /production/{order_id}?department=stitching → filtered list
GET  /production/{order_id}?department=packing   → filtered list
```

### 6.5 — `backend/app/api/v1/endpoints/transactions.py`
```
GET  /transactions/         → TransactionListResponse  (filter: party_id, date range)
POST /transactions/         → TransactionOut
```

### 6.6 — `backend/app/api/v1/endpoints/dashboard.py`
```
GET  /dashboard/summary     → DashboardSummary
```

### 6.7 — `backend/app/api/v1/router.py` (new file)
Wire all routers into a single `api_router`.

### 6.8 — `backend/app/main.py` (update)
- Include `api_router` at `/api/v1`
- Add CORS middleware (allow `http://localhost:3000`)
- Remove `Base.metadata.create_all` (Alembic handles it)

---

## Step 7: Frontend — Foundation

### 7.1 — Route restructure
The current `pages/` folder is wrong for App Router. Move to:
```
src/app/
├── (auth)/
│   └── login/
│       └── page.tsx
├── (dashboard)/
│   ├── layout.tsx          ← sidebar + topbar shell
│   ├── page.tsx            ← dashboard home
│   ├── orders/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── production/
│   │   └── page.tsx
│   ├── parties/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── ledger/
│       └── page.tsx
```

### 7.2 — `src/hooks/types.ts` (rename from tpes.tsx)
TypeScript interfaces matching Pydantic schemas:
```typescript
User, Order, OrderItem, Party, ProductionSession,
FinancialTransaction, DashboardSummary, PaginatedResponse<T>
```

### 7.3 — `src/hooks/utils.ts`
- `formatCurrency(amount)`, `formatDate(date)`, `getStatusColor(status)`
- `cn(...classes)` — className merge helper

### 7.4 — `src/hooks/store.tsx`
React Context with useReducer:
- `AuthContext` — `{ user, token, role, login(), logout() }`
- `AppContext` — `{ sidebarOpen, toggleSidebar, notifications }`

### 7.5 — `src/hooks/services.ts`
API client layer:
- `api` — axios instance with base URL + auth header interceptor
- `authService.login(username, password)`
- `ordersService.getOrders(filters)`, `.createOrder(data)`, `.updateStatus(id, status)`
- `partiesService.getParties()`, `.createParty(data)`, `.getPartyLedger(id)`
- `productionService.logSession(data)`, `.getSessionsForOrder(orderId)`
- `transactionsService.getTransactions(filters)`, `.createTransaction(data)`
- `dashboardService.getSummary()`

---

## Step 8: Frontend — Shared Components

### 8.1 — `src/components/common.tsx`
Reusable UI components:
- `<StatusBadge status />` — color-coded pill covering all 6 statuses:
  `pending` (amber) · `stitching_in_progress` (blue) · `stitching_complete` (purple)
  `packing_in_progress` (orange) · `packing_complete` (teal) · `dispatched` (gray)
- `<SummaryCard title, value, subtitle, icon, trend />` — KPI card
- `<DataTable columns, data, onSort, loading />` — sortable table
- `<Sheet open, onClose, title, children />` — slide-in form panel
- `<ConfirmDialog open, message, onConfirm, onCancel />`
- `<Spinner />`, `<EmptyState message />`
- `<Pagination total, page, size, onChange />`

### 8.2 — Dashboard layout shell — `src/app/(dashboard)/layout.tsx`
- Fixed 240px sidebar with logo, nav links (with active state), user avatar + role badge
- Top bar: page title + primary action button
- Route-aware active highlighting
- Role-based nav item visibility

---

## Step 9: Frontend — Pages

### 9.1 — Login page — `src/app/(auth)/login/page.tsx`
- Centered card, Inter font
- Username + password fields with Zod validation
- Error state on bad credentials
- Redirect to `/` on success, token stored in localStorage

### 9.2 — Dashboard — `src/app/(dashboard)/page.tsx`
- 4 KPI cards: Total Orders, Stitching In Progress, Packing In Progress, Dispatched
- Recent orders table (last 10) with status badge showing full lifecycle stage
- Uses `useDashboard()` hook → `dashboardService.getSummary()`

### 9.3 — Orders list — `src/app/(dashboard)/orders/page.tsx`
- DataTable with columns: Order#, Party, Goods, Quantity, Status, Delivery Date, Actions
- Filter bar: status dropdown (covers full lifecycle), party search, date range
- "+ New Order" button opens Sheet form (includes both stitching + packing rate fields)
- Row action menu: View Detail, Change Status, Delete

### 9.4 — Order detail — `src/app/(dashboard)/orders/[id]/page.tsx`
- Order header: number, party, status badge, dates
- Rate summary: stitching rates row + packing rates row
- Items table: size breakdown with stitched qty + packed qty columns
- Production sessions split into two tabs: **Stitching Sessions** | **Packing Sessions**
- Financial transactions for this order

### 9.5 — Parties list — `src/app/(dashboard)/parties/page.tsx`
- Table: Name, Phone, Balance (color-coded), Payment Terms, Actions
- "+ New Party" sheet form

### 9.6 — Party ledger — `src/app/(dashboard)/parties/[id]/page.tsx`
- Party info card + balance summary
- Transaction history table with running balance column
- "+ Record Payment" sheet form

### 9.7 — Production — `src/app/(dashboard)/production/page.tsx`
- Department toggle at top: **[Stitching]  [Packing]**
- Order search to select order
- Log session form: department (pre-selected from toggle), date, machines, start/end time, notes
- Sessions list filtered by selected department, grouped by order with totals

### 9.8 — Ledger — `src/app/(dashboard)/ledger/page.tsx`
- All transactions table: Date, Party, Order#, Type, Amount, Method
- Filter by party, type, date range
- "+ New Transaction" sheet form

---

## Step 10: Frontend — Component Implementations

### 10.1 — `src/components/orders.tsx`
- `<OrderForm onSubmit, onClose />` — create/edit sheet form
- `<OrderStatusSelect orderId, currentStatus, onChange />`
- `<OrderItemsTable items />`

### 10.2 — `src/components/production.tsx`
- `<SessionForm orderId, onSubmit, onClose />`
- `<SessionsList sessions />`

### 10.3 — `src/components/financial.tsx`
- `<TransactionForm partyId?, orderId?, onSubmit, onClose />`
- `<LedgerTable transactions, runningBalance />`

### 10.4 — `src/components/dashboard.tsx`
- `<KPICard>` composition
- `<RecentOrdersTable orders />`

---

## Step 11: Auth & Route Protection

### 11.1 — `src/middleware.ts`
Next.js middleware:
- Redirect `/` to `/login` if no token
- Redirect `/login` to `/` if already authenticated

### 11.2 — Protected route wrapper
`useAuth()` hook — if no user in context, redirect to login.

---

## File Creation Checklist

### Backend — New files to create
- [ ] `app/core/deps.py`
- [ ] `app/core/security.py` (implement)
- [ ] `app/schemas/__init__.py`
- [ ] `app/schemas/auth.py`
- [ ] `app/schemas/parties.py`
- [ ] `app/schemas/orders.py`
- [ ] `app/schemas/production.py`
- [ ] `app/schemas/financial.py`
- [ ] `app/schemas/dashboard.py`
- [ ] `app/services/auth_service.py`
- [ ] `app/services/party_service.py`
- [ ] `app/services/production_service.py`
- [ ] `app/services/financial_service.py`
- [ ] `app/services/dashboard_service.py`
- [ ] `app/services/audit_service.py`
- [ ] `app/api/v1/endpoints/auth.py`
- [ ] `app/api/v1/endpoints/parties.py`
- [ ] `app/api/v1/endpoints/production.py`
- [ ] `app/api/v1/endpoints/transactions.py`
- [ ] `app/api/v1/endpoints/dashboard.py`
- [ ] `app/api/v1/router.py`
- [ ] `alembic/` directory + migrations

### Backend — Files to modify
- [ ] `app/models/parties.py` — add `balance` field
- [ ] `app/models/base.py` — add soft-delete fields
- [ ] `app/services/order_service.py` — complete implementation
- [ ] `app/api/v1/endpoints/orders.py` — replace stub
- [ ] `app/main.py` — wire routers + CORS

### Frontend — Files to create
- [ ] `src/app/(auth)/login/page.tsx`
- [ ] `src/app/(dashboard)/layout.tsx`
- [ ] `src/app/(dashboard)/page.tsx`
- [ ] `src/app/(dashboard)/orders/page.tsx`
- [ ] `src/app/(dashboard)/orders/[id]/page.tsx`
- [ ] `src/app/(dashboard)/parties/page.tsx`
- [ ] `src/app/(dashboard)/parties/[id]/page.tsx`
- [ ] `src/app/(dashboard)/production/page.tsx`
- [ ] `src/app/(dashboard)/ledger/page.tsx`
- [ ] `src/middleware.ts`

### Frontend — Files to implement (currently empty)
- [ ] `src/hooks/types.ts`
- [ ] `src/hooks/utils.ts`
- [ ] `src/hooks/store.tsx`
- [ ] `src/hooks/services.ts`
- [ ] `src/components/common.tsx`
- [ ] `src/components/orders.tsx`
- [ ] `src/components/production.tsx`
- [ ] `src/components/financial.tsx`
- [ ] `src/components/dashboard.tsx`

---

## Execution Order

Execute steps in this sequence to avoid import errors:

1. **Step 1** — Fix models (parties + base)
2. **Step 2** — Alembic setup + migrate
3. **Step 3** — Security + deps
4. **Step 4** — All schemas
5. **Step 5** — All services
6. **Step 6** — All endpoints + wire main.py
7. **Step 7** — Frontend types, utils, context, API client
8. **Step 8** — Shared components + layout shell
9. **Step 9** — Pages (login → dashboard → orders → parties → production → ledger)
10. **Step 10** — Domain components
11. **Step 11** — Auth middleware

---

## Notes

- All list endpoints use offset pagination: `GET /resource?page=1&size=20`
- Soft delete: set `is_deleted=True`, filter on all queries with `is_deleted=False`
- Party balance: maintained as a denormalized running total on `parties.balance`
  — updated atomically in the same transaction as every `FinancialTransaction` insert
- JWT stored in `localStorage` (acceptable for internal tool; not public-facing)
- Stitch rate defaults stored in `config` table, overridable per order
