# AGENTS.md — CMT Stitching System

## Project Overview

CMT (Cut-Make-Trim) stitching and packing department management system. Tracks orders through the full production lifecycle, manages financials, inventory, and dispatching. Small-scale: 1–5 users, <500 orders/month.

**Production URLs**
- Frontend: https://cmt-stitching-asadullah-shafiques-projects.vercel.app
- Backend API: https://cmt-backend-5xuu.onrender.com/api/v1
- API Docs: https://cmt-backend-5xuu.onrender.com/docs

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS v4 |
| Backend | FastAPI 0.116+, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Database | PostgreSQL (Neon DB, shared — all CMT tables prefixed `cmt_`) |
| Auth | JWT, roles: `admin` \| `operator` \| `accountant` |
| Package manager (BE) | `uv` (pyproject.toml + uv.lock) — do NOT use pip to add deps |
| Deployment | Vercel (frontend), Railway (backend) |

---

## Repository Layout

```
cmt-stitching-system/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── main.py             # FastAPI app init, CORS, middleware, seeding
│   │   ├── core/
│   │   │   ├── config.py       # Settings (DATABASE_URL, SECRET_KEY, CORS)
│   │   │   ├── database.py     # SQLAlchemy async engine + session
│   │   │   ├── deps.py         # DI: current_user, db session
│   │   │   └── security.py     # JWT + bcrypt (no passlib — Python 3.13 issue)
│   │   ├── models/             # SQLAlchemy ORM models (all inherit BaseModel)
│   │   ├── schemas/            # Pydantic v2 request/response schemas
│   │   ├── services/           # Business logic layer
│   │   └── api/v1/
│   │       ├── router.py       # Aggregates all endpoint routers
│   │       └── endpoints/      # One file per domain (auth, orders, bills, …)
│   ├── alembic/versions/       # Migration chain (16 migrations, HEAD: o5j6k7l8m9n0)
│   ├── pyproject.toml          # Python project (requires >=3.13)
│   ├── requirements.txt        # pip fallback (keep in sync with pyproject.toml)
│   └── render.yaml             # Legacy Render config (now using Railway)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/         # login, register
│   │   │   └── (dashboard)/    # All protected routes
│   │   ├── components/         # Reusable UI (common.tsx, dashboard.tsx, …)
│   │   ├── hooks/              # services.ts/.tsx, store.tsx, types.ts/.tsx, utils.ts/.tsx
│   │   └── middleware.ts       # Route protection
│   ├── .env.local              # NEXT_PUBLIC_API_URL (local dev)
│   └── .env.production         # NEXT_PUBLIC_API_URL (production)
└── docs/plans/                 # Architecture and feature planning docs
```

---

## Key Conventions

### Backend

**Models** — all inherit `BaseModel` from `app/models/base.py`:
- UUID primary keys
- `created_at`, `updated_at`, `is_deleted`, `deleted_at` on every table
- All CMT tables prefixed `cmt_` (shared Neon DB)

**Services** — all business logic lives in `app/services/`. Routes are thin — they call services, not ORM directly.

**Schemas** — Pydantic v2. Use `model_validate()`, not `from_orm()`. Use `ConfigDict(from_attributes=True)`.

**Auth** — bcrypt used directly (not passlib). JWT via `python-jose`. Token expiry: 480 min (8h).

**DATABASE_URL** — uses `asyncpg://` in .env. Both `database.py` and `alembic/env.py` normalize it to `psycopg2://` for sync connections.

**Migrations** — always use ABSOLUTE paths when creating new migration files:
```
C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\<name>.py
```
Current HEAD: `o5j6k7l8m9n0` (add_overhead_tables)

**Migration chain:**
```
4d1e3598580f → a1b2c3d4e5f6 → b2c3d4e5f6a7 → c3d4e5f6a7b8 → d4e5f6a7b8c9
→ e5f6a7b8c9d0 → f6a7b8c9d0e1 → g7b8c9d0e1f2 → h8c9d0e1f2g3 → i9d0e1f2g3h4
→ j0e1f2g3h4i5 → k1f2g3h4i5j6 → l2g3h4i5j6k7 → m3h4i5j6k7l8 → n4i5j6k7l8m9
→ o5j6k7l8m9n0 [HEAD]
```

### Frontend

**Duplicate hook files** — BOTH `.ts` and `.tsx` versions exist and must be kept in sync:
- `src/hooks/services.ts` + `src/hooks/services.tsx`
- `src/hooks/types.ts` + `src/hooks/tpes.tsx` (note the typo in `.tsx`)
- `src/hooks/utils.ts` + `src/hooks/utils.tsx`

**API calls** — always go through `src/hooks/services.ts` (axios client with auth interceptors).

**State** — React Context + useReducer in `src/hooks/store.tsx`. No Redux.

**Routing** — Next.js App Router. Dashboard home is `/dashboard` (not `/`) to avoid route group conflict with `app/page.tsx`.

**Forms** — slide-in sheet pattern (not full-page navigation).

**Suspense** — wrap `useSearchParams()` calls in `<Suspense>` (Next.js 15 requirement).

---

## UI Design System

| Token | Value |
|-------|-------|
| Sidebar | `#1a2744` dark navy, 240px fixed |
| Primary | `#2563EB` (blue-600) |
| Background | `#F9FAFB` |
| Surface | `#FFFFFF` |
| Border | `#E5E7EB` |
| Font | Inter |
| Cards | `rounded-xl shadow-sm border border-gray-200` |
| Active nav | `bg-blue-600` highlight |

---

## Order Status Lifecycle

```
pending → stitching_in_progress → stitching_complete
        → packing_in_progress → packing_complete → dispatched
```

---

## All API Endpoints

```
Auth:        POST /auth/login  GET /auth/me  POST /auth/register
Orders:      CRUD /orders/  PATCH /orders/{id}/status
Parties:     CRUD /parties/  GET /parties/{id}/ledger
Production:  POST /production/  GET /production/{order_id}
Transactions: CRUD /transactions/
Bills:       CRUD /bills/  POST /bills/{id}/payments
Dashboard:   GET /dashboard/summary
Quality:     GET /quality/{order_id}  PATCH /quality/checkpoints/{id}  POST /quality/defects
Dispatch:    GET /dispatch/carriers  GET /dispatch/ready  PATCH /dispatch/{order_id}
Inventory:   CRUD /inventory/categories  CRUD /inventory/items  PATCH /inventory/items/{id}/adjust
Overhead:    CRUD /overhead/  CRUD /cash-accounts/  CRUD /cash-transactions/
Todos:       CRUD /todos/
Products:    CRUD /products/  CRUD /products/categories
Insights:    GET /insights/
Settings:    GET/PUT /settings/
```

---

## All Frontend Routes

```
/(auth)/login
/(auth)/register
/(dashboard)/dashboard
/(dashboard)/orders           /(dashboard)/orders/[id]  /(dashboard)/orders/[id]/jobcard
/(dashboard)/bills            /(dashboard)/bills/new    /(dashboard)/bills/[id]
/(dashboard)/parties          /(dashboard)/parties/[id]
/(dashboard)/production
/(dashboard)/ledger
/(dashboard)/quality
/(dashboard)/dispatch
/(dashboard)/inventory
/(dashboard)/overhead
/(dashboard)/todos
/(dashboard)/products
/(dashboard)/settings
/(dashboard)/reports
```

---

## Development Setup

### Backend
```bash
cd backend
uv sync                                   # Install deps
cp .env.example .env                      # Set DATABASE_URL, SECRET_KEY
alembic upgrade head                      # Run migrations
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# .env.local should have: NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

---

## Adding a New Feature (Decision Tree)

```
1. Backend model needed?
   YES → Add to app/models/ → create Alembic migration → alembic upgrade head
   NO  → Skip

2. New API endpoints?
   YES → Add schema in app/schemas/
       → Add service in app/services/
       → Add router in app/api/v1/endpoints/
       → Register in app/api/v1/router.py

3. Frontend page needed?
   YES → Add page in src/app/(dashboard)/
       → Add service call in src/hooks/services.ts AND services.tsx
       → Add types in src/hooks/types.ts AND tpes.tsx (keep both in sync)
       → Register in sidebar nav in (dashboard)/layout.tsx
```

---

## Adding a Migration

```bash
cd backend
alembic revision --autogenerate -m "describe_change"
# File created in alembic/versions/ — verify it looks correct
alembic upgrade head
```

Then update the migration chain comment in this file and in MEMORY.md.

---

## Testing

Smoke test covers all endpoints:
```bash
cd backend
python test_smoke.py --base-url http://localhost:8000/api/v1
# or against prod:
python test_smoke.py --base-url https://<railway-url>/api/v1
```

---

## Deployment

### Frontend (Vercel — automatic)
- Push to `master` → Vercel auto-deploys
- Env var `NEXT_PUBLIC_API_URL` set in Vercel dashboard

### Backend (Railway)
- Push to `master` → Railway auto-deploys
- Railway start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Required env vars: `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_ORIGINS`, `ACCESS_TOKEN_EXPIRE_MINUTES=480`

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| `useSearchParams()` throws on build | Wrap page in `<Suspense>` |
| Alembic migration on shared DB creates wrong table names | Ensure all models have `__tablename__ = "cmt_..."` |
| `asyncpg://` vs `psycopg2://` | `database.py` normalizes; don't change this |
| Only `.ts` updated, `.tsx` broken | Always update both files in `src/hooks/` |
| bcrypt import error | Use `import bcrypt` directly, not passlib |
| Railway/Render cold start | Railway starter tier = always-on; no cold starts |
