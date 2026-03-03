# CMT Stitching & Packing Management System — Architecture & Design

**Date:** 2026-03-02
**Scale:** Small (1–5 users, <500 orders/month)
**Stack:** Next.js 15 · FastAPI · PostgreSQL · TailwindCSS v4 · TypeScript

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Next.js 15 Frontend                    │
│  TailwindCSS v4 · TypeScript · React Context             │
│  Route groups: (auth) / (dashboard)                      │
└─────────────────────┬────────────────────────────────────┘
                      │ REST (JSON)
┌─────────────────────▼────────────────────────────────────┐
│               FastAPI Backend  /api/v1/                   │
│  JWT Auth · Role guards (Admin, Operator, Accountant)     │
│  Pydantic v2 schemas · SQLAlchemy 2.0 ORM                │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│                   PostgreSQL                              │
│  UUID PKs · Alembic migrations · Soft deletes            │
└──────────────────────────────────────────────────────────┘
```

### Key Decisions

- **No Redux** — React Context + `useReducer` is sufficient for this scale
- **REST only** — No GraphQL; clean, predictable API surface
- **Monolithic backend** — Single FastAPI app with modular routers per domain
- **Cursor-based pagination** — All list endpoints return `{ data, total, page, size }`
- **Audit log middleware** — Every write auto-logs to `audit_logs` table

---

## 2. Phased Implementation Plan

### Phase 1 — Core MVP (Orders + Financial Ledger + Production Tracking)

| Layer | Work |
|---|---|
| Backend | Auth endpoints, JWT middleware, role guards |
| Backend | Orders CRUD + OrderItems (sizes/quantities) |
| Backend | Parties CRUD (client management) |
| Backend | Production Sessions (machines, duration, labor) |
| Backend | Financial Transactions (payments in/out, party ledger) |
| Backend | Alembic migrations for all above |
| Frontend | Login page, JWT token storage, protected routes |
| Frontend | Dashboard (KPI cards, recent orders, activity) |
| Frontend | Orders — list, create, edit, status management |
| Frontend | Production — log sessions per order |
| Frontend | Ledger — party-wise transaction history + balance |

### Phase 2 — Inventory & Expenses

- Inventory items, categories, real-time stock tracking
- Consumption logs linked to orders
- Low-stock in-app alerts
- Expense entry (variable per order + overhead)
- Expense categories with budget tracking

### Phase 3 — Reporting & Polish

- P&L summary (monthly/yearly)
- PDF invoice generation (per order, per party)
- Excel export (ledgers, inventory logs)
- Audit log viewer (admin only)
- Environment-based config for stitch rates and overheads

**Build order within each phase:**
> Backend models → Alembic migration → API endpoints → Pydantic schemas → Frontend service layer → UI pages

---

## 3. Data Models

### Additions to existing skeleton

```python
# parties.py — add running balance
balance = Column(Decimal(12, 2), default=0)

# users.py — add role
role = Column(String(20), default="operator")  # admin | operator | accountant

# orders.py — add packing rates + order lifecycle status
pack_rate_party = Column(Decimal(10, 2), nullable=True)
pack_rate_labor = Column(Decimal(10, 2), nullable=True)
# status enum: pending | stitching_in_progress | stitching_complete
#              | packing_in_progress | packing_complete | dispatched

# order_items — add packing completion tracking
packed_quantity = Column(Integer, default=0)  # alongside completed_quantity (stitching)

# production_sessions — add department
department = Column(String(20), nullable=False, default="stitching")  # stitching | packing

# config.py — environment-based defaults
default_stitch_rate_party = Column(Decimal(10, 2))
default_stitch_rate_labor = Column(Decimal(10, 2))
default_pack_rate_party = Column(Decimal(10, 2))
default_pack_rate_labor = Column(Decimal(10, 2))
default_overhead_monthly = Column(Decimal(10, 2))
```

### Core relationships

```
Party ──< Order ──< OrderItem (completed_quantity=stitching, packed_quantity=packing)
             │
             ├──< ProductionSession (department: stitching|packing)
             ├──< Expense
             └──< FinancialTransaction

InventoryItem ──< InventoryTransaction
                      └── references Order (optional)

User ──< AuditLog
```

---

## 4. API Contract (Phase 1)

```
POST   /api/v1/auth/login              → { access_token, token_type, user }
GET    /api/v1/auth/me                 → current user + role

GET    /api/v1/parties/                → paginated list
POST   /api/v1/parties/                → create party
GET    /api/v1/parties/{id}/ledger     → transactions + running balance

GET    /api/v1/orders/                 → list (filter: status, party, date range)
POST   /api/v1/orders/                 → create with items []
PATCH  /api/v1/orders/{id}/status      → update status
GET    /api/v1/orders/{id}             → full detail: items + sessions + expenses

POST   /api/v1/production/             → log a production session
GET    /api/v1/production/{order_id}   → all sessions for an order

POST   /api/v1/transactions/           → record payment / income
GET    /api/v1/transactions/           → list (filter: party, type, date range)

GET    /api/v1/dashboard/summary       → { pending_orders, total_receivable,
                                           recent_orders, low_stock_alerts }
```

All list responses: `{ data: T[], total: int, page: int, size: int }`

### Role guards

| Endpoint group | Admin | Accountant | Operator |
|---|---|---|---|
| Auth | ✓ | ✓ | ✓ |
| Orders (read) | ✓ | ✓ | ✓ |
| Orders (write) | ✓ | — | ✓ |
| Production | ✓ | — | ✓ |
| Financial Ledger | ✓ | ✓ | — |
| Audit Logs | ✓ | — | — |

---

## 5. Frontend Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx              ← Sidebar + topbar shell
│       ├── page.tsx                ← Dashboard home
│       ├── orders/
│       │   ├── page.tsx            ← Orders list table
│       │   ├── new/page.tsx        ← Create order form
│       │   └── [id]/page.tsx       ← Order detail + status
│       ├── production/
│       │   └── page.tsx            ← Log sessions, view per order
│       ├── parties/
│       │   ├── page.tsx            ← Party list
│       │   └── [id]/page.tsx       ← Party ledger + balance
│       └── ledger/
│           └── page.tsx            ← All financial transactions
├── components/
│   ├── ui/                         ← StatusBadge, DataTable, FormModal,
│   │                                   SummaryCard, DateRangePicker
│   ├── orders/                     ← OrderForm, OrderRow, OrderDetail
│   ├── production/                 ← SessionForm, SessionList
│   ├── parties/                    ← PartyForm, LedgerTable
│   └── dashboard/                  ← KPICard, RecentOrdersTable
├── context/
│   ├── AuthContext.tsx
│   └── AppContext.tsx
├── hooks/
│   ├── useOrders.ts
│   ├── useParties.ts
│   ├── useProduction.ts
│   └── useLedger.ts
├── services/
│   └── api.ts                      ← Axios instance + typed endpoints
└── types/
    └── index.ts                    ← Shared TypeScript interfaces
```

---

## 6. Design System

### Colors

| Token | Value | Usage |
|---|---|---|
| Background | `#F9FAFB` | Page background |
| Surface | `#FFFFFF` | Cards, sidebar |
| Border | `#E5E7EB` | Card borders, dividers |
| Primary | `#2563EB` | Buttons, active nav, links |
| Text primary | `#111827` | Headings, table data |
| Text muted | `#6B7280` | Labels, secondary info |

### Status Badges

| Status | Background | Text |
|---|---|---|
| Pending | `#FEF3C7` | `#D97706` |
| In-progress | `#DBEAFE` | `#1D4ED8` |
| Completed | `#D1FAE5` | `#059669` |
| Overdue | `#FEE2E2` | `#DC2626` |

### Layout Shell

- Fixed left sidebar: 240px, white, `border-r border-gray-200`
- Logo + nav links + user avatar/role badge at bottom
- Top bar: page title + breadcrumb + primary action button
- Content area: white cards with `rounded-xl shadow-sm border border-gray-200`
- Dashboard: 4-column KPI row → chart area → recent orders table

### Component Quality Standards

- **Tables:** sortable headers, row hover, inline status badge, `...` action menu
- **Forms:** floating labels, Zod client-side validation, loading spinner on submit
- **Modals:** slide-in sheet from right for create/edit (no full-page navigation)
- **Typography:** Inter — `text-sm` tables, `text-base` forms, `text-2xl font-semibold` headings
