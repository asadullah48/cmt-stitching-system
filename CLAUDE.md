# CLAUDE.md — CMT Stitching System

## Project Context

CMT stitching + packing management system. Small scale: 1–5 users, <500 orders/month. Personal project — optimize for simplicity over scale.

See `AGENTS.md` for full architecture, file layout, endpoints, and conventions.

---

## Stack (SETTLED — do not change)

- **Frontend:** Next.js 15, TailwindCSS v4, TypeScript, React Context (no Redux)
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL, Alembic
- **Auth:** JWT — roles: `admin` | `operator` | `accountant`
- **Backend package manager:** `uv` — use `uv add <pkg>`, never `pip install`

---

## Critical Rules

### Backend

1. **bcrypt direct** — `import bcrypt` not passlib (Python 3.13 incompatibility)
2. **DATABASE_URL** — always `asyncpg://` in .env; `database.py` and `alembic/env.py` normalize to `psycopg2://` — do not break this
3. **Table prefix** — all CMT tables use `cmt_` prefix (shared Neon DB with another project)
4. **Migration files** — use ABSOLUTE paths: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\`
5. **Migration HEAD** — currently `s9n0o1p2q3r4` (add_lot_and_suborder); always append, never modify existing migrations
6. **Services layer** — business logic in `app/services/`, not in route handlers

### Frontend

1. **Dual hook files** — `src/hooks/` has `.ts` AND `.tsx` duplicates — ALWAYS update both:
   - `services.ts` + `services.tsx`
   - `types.ts` + `tpes.tsx` (typo in `.tsx` filename is intentional — do not rename)
   - `utils.ts` + `utils.tsx`
2. **useSearchParams** — always wrap in `<Suspense>` (Next.js 15 requirement)
3. **Dashboard route** — home is `/dashboard` not `/` (route group conflict)
4. **Forms** — slide-in sheet pattern, not full-page navigation
5. **No Redux** — React Context + useReducer only

---

## Code Style

- Keep it simple — this is a personal project, not enterprise software
- No speculative abstractions — solve what's actually needed
- No error handling for impossible scenarios
- No docstrings on unchanged code
- Don't add features beyond what's asked

---

## UI Design System

- Sidebar: `#1a2744` dark navy, 240px fixed
- Primary: `#2563EB` (blue-600)
- Background: `#F9FAFB`, Surface: `#FFFFFF`, Border: `#E5E7EB`
- Cards: `rounded-xl shadow-sm border border-gray-200`
- Font: Inter
- Active nav: `bg-blue-600` highlight

---

## Deployment

- **Frontend** → Vercel (auto-deploy on push to master)
- **Backend** → Railway (always-on, no cold starts)
- **DB** → Neon PostgreSQL (shared, `cmt_` prefix on all tables)

### Backend env vars required
```
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=<jwt-secret>
ALLOWED_ORIGINS=https://cmt-stitching-asadullah-shafiques-projects.vercel.app
ACCESS_TOKEN_EXPIRE_MINUTES=480
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<password>
```

---

## When Adding Features

```
Backend:  model → migration → schema → service → endpoint → register in router.py
Frontend: service call (both .ts + .tsx) → types (both files) → page → add to sidebar nav
```

---

## Common Commands

```bash
# Backend dev
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend dev
cd frontend && npm run dev

# New migration
cd backend && alembic revision --autogenerate -m "describe" && alembic upgrade head

# Smoke test
cd backend && python test_smoke.py --base-url http://localhost:8000/api/v1
```
