# CLAUDE.md — CMT Stitching System

Personal project. 1–5 users, <500 orders/month. Full architecture in **AGENTS.md**.

## Stack (settled — do not change)
- **Frontend:** Next.js 15 · React 19 · TypeScript · TailwindCSS v4 · React Context (no Redux)
- **Backend:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PostgreSQL (Neon) · Alembic
- **Auth:** JWT — roles `admin | operator | accountant` · **Pkg manager:** `uv` — never `pip install`

## Rules
- **bcrypt direct** — `import bcrypt`, not passlib (Python 3.13)
- **DATABASE_URL** — `asyncpg://` in `.env`; code normalises to `psycopg2://` — don't break this
- **Table prefix** — all CMT tables use `cmt_` (shared Neon DB)
- **Migrations** — append only, never modify existing; absolute path in `backend/alembic/versions/`
- **Base import** — ORM models use `app.models.base`, never `app.core.database`
- **Services layer** — business logic in `app/services/`, not in route handlers
- **Hook files** — edit only `services.ts`, `types.ts`, `utils.ts`; no `.tsx` duplicates remain
- **Type-check** — `npx tsc --noEmit` before every push; catches Vercel-only import failures
- **Forms** — slide-in sheet pattern; `useSearchParams` in `<Suspense>`; home is `/dashboard`
- **Bills** — A=stitching B=accessories C=packing D=misc; first bill dispatches; B-series needs accessory rows for PDF
- **Sidebar** — always `#1a2744` navy; when shadcn init writes CSS vars pin `--sidebar` to `#1a2744`; verify by eye after any `globals.css` change
- **Components** — new UI imports from `@/components/ui/*` only; `common.tsx` stays intact until a page is fully migrated; never do a big-bang rewrite
- **Phase gate** — stop after each phase and wait for explicit written approval before touching the next file; "ok" is not an approval phrase

## Deployment
- **Frontend** → Vercel (auto on `master`; force: `cd frontend && npx vercel --prod --yes`)
- **Backend** → Koyeb (auto on `master`) · **DB** → Neon Postgres
