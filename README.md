# CMT Stitching System

Production management system for a CMT (Cut, Make, Trim) stitching and packing department. Tracks orders through the full lifecycle, manages financials, inventory, auto-billing, and dispatch.

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://cmt-stitching-asadullah-shafiques-projects.vercel.app |
| Backend API | https://level-hazel-agenticengineer-d513213b.koyeb.app/api/v1 |
| API Docs | https://level-hazel-agenticengineer-d513213b.koyeb.app/docs |

> Backend runs on Koyeb (always-on, no cold start). Both services auto-deploy on push to `master`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS v4 |
| Backend | FastAPI 0.116+, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Database | PostgreSQL (Neon) — shared DB, all tables prefixed `cmt_` |
| Auth | JWT, roles: `admin` \| `operator` \| `accountant` |
| Package manager | `uv` (backend), `npm` (frontend) |
| Deployment | Vercel (frontend), Koyeb (backend) |

## Features

### Orders & Production
- **Orders** — Full lifecycle: `pending → stitching_in_progress → stitching_complete → packing_in_progress → packing_complete → dispatched`
- **Production Sessions** — Log stitching and packing sessions with machine count and hours per order
- **Lot Numbers & Sub-Orders** — Per-party sequential lot numbers; sub-orders with configurable packing stages
- **Quality Control** — Checkpoints and defect logging per order

### Billing & Finance
- **Auto-Bill Generation** — On dispatch, bills are automatically created from rate templates keyed to the product type. Customer bills (A/C series) + Labour/Vendor payable entries generated in one click
- **Bill Rate Templates** — Editable rate table in Settings: customer rate, labour rate, vendor rate per product type and series
- **Bill Series** — A (stitching), B (accessories/misc), C (packing); one order can carry all three, each appearing separately in the ledger
- **Manual Bills** — Auto-numbered bills, partial/full payment tracking, bill delete with ledger reversal
- **Standalone Bills** — Bills without a linked order for direct party charges
- **Party Ledger** — Per-party receivable/payable history with running balance and CSV export
- **General Ledger** — All transaction types: `income`, `packing`, `accessories`, `payment`, `expense_material`, `expense_transport`, `expense_misc`, `purchase`, `stock_consumption`, `adjustment`
- **Three-Ledger System** — Party (receivable), CMT Labour (payable), CMT Vendors (payable); use party type filter (Customers / Labour / Vendors) on the Parties page

### Inventory & Expenses
- **Inventory** — Categories, items, stock adjustments (in/out) with full history
- **BOM / Material Requirements** — Product templates with bill-of-materials; auto-consumes inventory on production
- **Expense Sub-types** — Material, transport, and miscellaneous expenses tracked separately

### Operations
- **Dispatch** — Mark orders dispatched with carrier, tracking number, carton count, and weight
- **Todos** — Task management with priority, category, due dates, and recurring schedules
- **Overhead & Cash** — Fixed business costs (rent, wages, utilities) with unpaid/paid status. Two cash accounts (Cash In Hand + Bank) with reserve amounts and running balance ledger
- **Share Links** — Token-based read-only bill URLs, shareable without login

### Dashboard & Insights
- **Dashboard** — Live KPIs: active orders, monthly revenue, stitching/packing progress, cash position
- **Income Summary** — Per-order profit: gross income minus labour, transport, loading, rent, and miscellaneous

## Order Status Lifecycle

```
pending → stitching_in_progress → stitching_complete
        → packing_in_progress → packing_complete → dispatched
```

## Project Structure

```
cmt-stitching-system/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # FastAPI routers (one file per domain)
│   │   ├── models/             # SQLAlchemy ORM models (cmt_ prefix)
│   │   ├── schemas/            # Pydantic v2 request/response schemas
│   │   ├── services/           # Business logic layer
│   │   └── main.py
│   ├── alembic/                # Database migrations
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── app/                # Next.js App Router pages
│       │   ├── (auth)/         # login, register
│       │   ├── (dashboard)/    # All protected routes
│       │   └── share/          # Public bill share route
│       ├── components/         # Reusable UI components
│       └── hooks/              # services, types, utils (dual .ts/.tsx)
└── docs/
    └── plans/                  # Architecture and feature planning docs
```

## Local Development

### Backend

```bash
cd backend
uv sync
cp .env.example .env            # Set DATABASE_URL, SECRET_KEY
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
# .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

## Environment Variables

### Backend

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (`asyncpg://` format) |
| `SECRET_KEY` | JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime in minutes (default: 480) |
| `ADMIN_USERNAME` | Seeded admin account username |
| `ADMIN_EMAIL` | Seeded admin account email |
| `ADMIN_PASSWORD` | Seeded admin account password |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

## Smoke Test

End-to-end test covering all API endpoints.

```bash
cd backend
PYTHONIOENCODING=utf-8 python test_smoke.py --base-url http://localhost:8000/api/v1
# Keep test data for inspection:
PYTHONIOENCODING=utf-8 python test_smoke.py --base-url http://localhost:8000/api/v1 --keep
```

## DB Migration Chain

```
4d1e3598580f → a1b2c3d4e5f6 → b2c3d4e5f6a7 → c3d4e5f6a7b8 → d4e5f6a7b8c9
→ e5f6a7b8c9d0 → f6a7b8c9d0e1 → g7b8c9d0e1f2 → h8c9d0e1f2g3 → i9d0e1f2g3h4
→ j0e1f2g3h4i5 → k1f2g3h4i5j6 → l2g3h4i5j6k7 → m3h4i5j6k7l8 → n4i5j6k7l8m9
→ o5j6k7l8m9n0 → p6k7l8m9n0o1 → q7l8m9n0o1p2 → r8m9n0o1p2q3 → s9n0o1p2q3r4
→ 860bf63b6a35 → 6372e9df1d35 → 750a1916cced [HEAD]
```
