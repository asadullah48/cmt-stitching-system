# CMT Stitching System

A simple, friendly production-management system for a CMT (Cut-Make-Trim) stitching and packing business. Track orders through the full lifecycle, manage billing and cash, run reports, and share read-only bill links — all from one dashboard.

Built for small teams (1–5 users, <500 orders/month). Optimised for clarity, not scale.

## Live URLs

| | URL |
|--|--|
| **App** | https://cmt-stitching-asadullah-shafiques-projects.vercel.app |
| **API** | https://level-hazel-agenticengineer-d513213b.koyeb.app/api/v1 |
| **API Docs** | https://level-hazel-agenticengineer-d513213b.koyeb.app/docs |

Both services auto-deploy on push to `master`. Backend (Koyeb) is always-on — no cold start.

---

## What you can do

- 📋 **Orders** — full lifecycle from `pending` through `dispatched`, with sub-orders and lot numbers
- 🧵 **Production** — log stitching / packing sessions, track QC checkpoints and defects
- 🧾 **Bills** — four series (A stitching, B accessories, C packing, D misc); auto-generated on dispatch from rate templates
- 💰 **Cash & Overhead** — two accounts (Cash In Hand + Bank) with running balances, reserves, and overhead expense tracking
- 📒 **Ledgers** — per-party receivable/payable history + general ledger; CSV export
- 📦 **Inventory** — categories, items, stock moves; BOM auto-consumes inventory on production
- 🚚 **Dispatch** — carrier + tracking + carton count; one-click *Dispatch & Bill*
- ✅ **Todos** — priorities, categories, recurring
- 📊 **Dashboard** — active orders, pipeline, cash position, smart alerts
- 🔗 **Share links** — public read-only bill URLs (no login needed)

---

## Quick start (local)

### Backend

```bash
cd backend
uv sync                                   # install deps (uses uv.lock)
cp .env.example .env                      # fill DATABASE_URL + SECRET_KEY
uv run alembic upgrade head               # migrate
uv run uvicorn app.main:app --reload --port 8000
```

Boot check (always run before pushing):

```bash
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"
```

### Frontend

```bash
cd frontend
npm install
# .env.local:  NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev                               # http://localhost:3000
```

TypeScript check before pushing (catches what Vercel's build would):

```bash
cd frontend && npx tsc --noEmit
```

---

## Adding data (how the app actually gets used)

Most day-to-day work goes through the UI — no scripts, no SQL.

| Want to... | Go to |
|-----------|-------|
| Create a new order | **Orders → + New Order** (or dashboard *Quick Actions*) |
| Log production work | **Production → Start Batch** |
| Record QC / defects | **Quality** |
| Issue a bill | Auto on *Dispatch & Bill*, or **Bills → + New Bill** for manual/standalone |
| Add a cash entry | **Overhead → + Entry** (credit/debit per account) |
| Set opening balance / reserve | **Overhead → Edit** on the balance card |
| Add an overhead expense | **Overhead → + Add Expense** |
| View a party's ledger | **Parties → open a party** (balance, CSV export, share link) |
| Share a bill externally | **Bills → open a bill → Share** (token-based read-only URL) |
| Manage rate templates | **Settings → Bill Rate Templates** |
| Adjust alert thresholds | **Settings → Smart Alert Thresholds** |

Bulk ledger import (Excel → API) is also available — see [`backend/scripts/`](./backend/scripts/).

---

## Project layout

```
cmt-stitching-system/
├── backend/         FastAPI app — models, schemas, services, endpoints
│   ├── app/
│   ├── alembic/     migrations
│   └── scripts/     operational scripts (ledger import)
├── frontend/        Next.js 15 app (App Router)
│   └── src/
│       ├── app/(auth)/       login, register
│       ├── app/(dashboard)/  all protected routes
│       ├── app/share/        public bill share route
│       ├── components/       reusable UI
│       └── hooks/            services / types / utils
└── docs/            planning + design docs (see docs/INDEX.md)
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS v4 |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic |
| Database | PostgreSQL (Neon, shared — CMT tables prefixed `cmt_`) |
| Auth | JWT — roles `admin` / `operator` / `accountant` |
| Package managers | `uv` (backend), `npm` (frontend) |
| Deployment | Vercel (frontend), Koyeb (backend) |

---

## Environment variables

### Backend

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres URL (`asyncpg://` format — normalised to `psycopg2` internally) |
| `SECRET_KEY` | JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT lifetime (default 480) |
| `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin account |

### Frontend

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

---

## Deploying

- **Frontend** → push to `master`; Vercel auto-deploys. Force: `cd frontend && npx vercel --prod --yes`.
- **Backend** → push to `master`; Koyeb auto-deploys. Start: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

---

## Further reading

- [`CLAUDE.md`](./CLAUDE.md) — rules / conventions for the AI assistant
- [`AGENTS.md`](./AGENTS.md) — full architecture, endpoints, migration chain
- [`docs/INDEX.md`](./docs/INDEX.md) — design + planning docs, organised by area
