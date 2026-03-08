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
- **Backend API:** https://cmt-backend-5xuu.onrender.com/api/v1
- **API Docs:** https://cmt-backend-5xuu.onrender.com/docs

> The backend runs on Render free tier and may take ~30 seconds to wake from cold start.

## Features

- **Orders** — Create and track orders through the full lifecycle: pending → stitching → packing → dispatched
- **Production** — Log stitching and packing sessions per order with machine count and hours
- **Quality Control** — Checkpoints and defect logging per order
- **Dispatch** — Mark orders as dispatched with carrier, tracking number, carton count, and weight
- **Financial Ledger** — Record income and payments per party, track running balances
- **Income Summary** — Per-order profit calculation deducting labor, transport, loading, rent, and miscellaneous expenses
- **Dashboard** — Live KPIs: active orders, monthly revenue, stitching/packing progress
- **Parties** — Manage customer/vendor parties with ledger history

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

### Frontend

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
