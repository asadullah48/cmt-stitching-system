# CMT Stitching System

A production management system for a CMT (Cut, Make, Trim) stitching and packing department. Tracks orders, production sessions, quality control, dispatch, financial ledger, and per-order income analysis.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TailwindCSS v4, TypeScript |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL (Neon) |
| Auth | JWT — roles: admin, operator, accountant |
| Migrations | Alembic |
| Package manager | uv (backend), npm (frontend) |

## Deployed

- **Frontend:** https://cmt-stitching-asadullah-shafiques-projects.vercel.app
- **Backend API:** https://level-hazel-agenticengineer-d513213b.koyeb.app/api/v1
- **API Docs:** https://level-hazel-agenticengineer-d513213b.koyeb.app/docs

> The backend runs on Koyeb (always-on, no cold start).

## Features

- **Orders** — Create and track orders through the full lifecycle: pending → stitching → packing → dispatched
- **Production** — Log stitching and packing sessions per order with machine count and hours
- **Inventory** — Categories, items, stock adjustments (in/out) with full history; quick stock-check widget
- **Billing** — Auto-numbered bills per series, partial/full payment tracking, bill delete with ledger reversal
- **Financial Ledger** — All 6 transaction types: income, payment, expense, purchase, stock_consumption, adjustment
- **Quality Control** — Checkpoints and defect logging per order
- **Dispatch** — Mark orders as dispatched with carrier, tracking number, carton count, and weight
- **Income Summary** — Per-order profit calculation deducting labor, transport, loading, rent, and miscellaneous expenses
- **Todos** — Task management with priority, category (billing/maintenance/workflow/order), due dates, recurring schedules (daily/weekly/monthly/custom), and a floating quick-add button on every page
- **Overhead & Cash** — Track fixed business costs (rent, wages, utilities, insurance) with unpaid/paid status, recurring auto-spawn, and per-payment cash account debiting. Two cash accounts (Cash In Hand + Bank) with opening balance, manual credit/debit entries, and a running balance ledger
- **Dashboard** — Live KPIs: active orders, monthly revenue, stitching/packing progress, cash position widget
- **Parties** — Manage customer/vendor parties with full ledger history
- **Lot Numbers & Sub-Orders** — Per-party sequential lot numbers on orders; optional B sub-order with configurable packing stages
- **B-Series Bills (Accessories)** — Series-B bills for accessories and material charges, linked to the same order and party ledger
- **Standalone Bills** — Bills without a linked order for direct party charges (`order_id = null`)
- **Share Links** — Token-based read-only URLs for bills and party statements, shareable without login

## Order Status Lifecycle

```
pending → stitching_in_progress → stitching_complete → packing_in_progress → packing_complete → dispatched
```

## Income Calculation (per order)

```
Gross Income     = (stitch_rate_party + pack_rate_party) × total_quantity
− Labor Cost     = (stitch_rate_labor + pack_rate_labor) × total_quantity
− Transport Expense
− Loading Expense
− Miscellaneous Expense
− Rent
− Loading Charges
─────────────────────────────────────────────────────
= Net Income
```

## Project Structure

```
cmt-stitching-system/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # FastAPI routers
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── services/           # Business logic
│   │   └── main.py
│   ├── alembic/                # Database migrations
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── app/                # Next.js app router pages
│       ├── components/         # Reusable UI components
│       └── hooks/              # Services, types, utils
└── docs/
    └── plans/                  # Design and planning documents
```

## Smoke Test

End-to-end test covering all API endpoints. Creates mock data, validates responses, then cleans up.

```bash
cd backend
# Against local server:
PYTHONIOENCODING=utf-8 python test_smoke.py --base-url http://localhost:8000/api/v1

# Keep test data for inspection:
PYTHONIOENCODING=utf-8 python test_smoke.py --base-url http://localhost:8000/api/v1 --keep
```

Full report: `backend/docs/smoke-test-results.md`

## DB Migration Chain

```
4d1e3598580f → a1b2c3d4e5f6 → b2c3d4e5f6a7 → c3d4e5f6a7b8 → d4e5f6a7b8c9
→ e5f6a7b8c9d0 → f6a7b8c9d0e1 → g7b8c9d0e1f2 → h8c9d0e1f2g3 → i9d0e1f2g3h4
→ j0e1f2g3h4i5 → k1f2g3h4i5j6 → l2g3h4i5j6k7 → m3h4i5j6k7l8 → n4i5j6k7l8m9
→ o5j6k7l8m9n0 → p6k7l8m9n0o1 → q7l8m9n0o1p2 → r8m9n0o1p2q3 → s9n0o1p2q3r4 [HEAD]
```

> Both frontend (Vercel) and backend (Koyeb) auto-deploy on push to `master`.

## Local Development

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to point to your backend (e.g. `http://localhost:8000/api/v1`).

## Environment Variables

### Backend

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg:// format) |
| `SECRET_KEY` | JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token lifetime in minutes (default: 480) |
| `ADMIN_USERNAME` | Seeded admin account username |
| `ADMIN_EMAIL` | Seeded admin account email |
| `ADMIN_PASSWORD` | Seeded admin account password |

### Frontend

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
