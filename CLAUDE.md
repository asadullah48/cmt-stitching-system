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
7. **Base import** — ORM models import `Base` from `app.models.base`, never from `app.core.database`
8. **Self-referential relationships** — always include `primaryjoin` with `remote()` to avoid mapper direction errors:
   ```python
   sub_orders = relationship("Order",
       primaryjoin="Order.id == remote(Order.parent_order_id)",
       foreign_keys="[Order.parent_order_id]",
       backref="parent_order")
   ```
9. **Multiple bills per order** — intentional by design. Do not add a duplicate-bill guard. First bill dispatches the order; second bill skips re-dispatch. Bill delete only reverts order status if no other active bills remain.
10. **Boot check before every push** — `cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"` must pass

### Frontend

1. **Dual hook files** — `src/hooks/` has `.ts` AND `.tsx` duplicates — ALWAYS update both:
   - `services.ts` + `services.tsx`
   - `types.ts` + `tpes.tsx` (typo in `.tsx` filename is intentional — do not rename)
   - `utils.ts` + `utils.tsx`
2. **useSearchParams** — always wrap in `<Suspense>` (Next.js 15 requirement)
3. **Dashboard route** — home is `/dashboard` not `/` (route group conflict)
4. **Forms** — slide-in sheet pattern, not full-page navigation
5. **No Redux** — React Context + useReducer only
6. **Bill accessories display** — accessories only auto-show on a bill when it is the sole bill for that order (`res.total === 1` check in `bills/[id]/page.tsx`). Do not remove this guard.

---

## Bill Series Convention (SETTLED)

| Series | Purpose |
|--------|---------|
| **A** | Stitching & packing bills (primary) |
| **B** | Accessories, materials, misc charges |
| C–E   | Reserved |

One order can have both an A-bill (stitching) and a B-bill (accessories). Both link to the same order and appear separately in the party ledger.

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
- **Backend** → Koyeb (auto-deploy on push to master)
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

## Before Starting Any Task

**State your verification plan first.** Before writing any code, briefly say how you will confirm the work is correct — e.g. "I'll start the local server and curl the endpoint" or "I'll run the test suite" or "I'll use Playwright to check the UI." Then do the work. Then verify.

---

## Verification — REQUIRED

**Never declare a task complete without verifying it works.** Rules by type:

### Backend / API changes
1. Start the local server in the background
2. Hit every new or modified endpoint with `curl` and confirm the response shape is correct
3. Only then push to master

### Tests
1. After writing or modifying tests, run them immediately
2. Confirm all tests pass — do not commit failing tests
3. If a test fails, fix the code (or the test if it's wrong) before moving on

---

## Verification Tools

### Playwright — UI verification
Use Playwright browser tools to navigate to the live app and confirm UI changes are visible and correct.

**When to use:** After deploying frontend changes — navigate to the production URL, take a screenshot or snapshot, interact with the relevant page to confirm the feature works.

**Production URL:** `https://cmt-stitching-asadullah-shafiques-projects.vercel.app`

**Key tools:**
- `browser_navigate` — open a URL
- `browser_snapshot` — read the page DOM (fast, good for checking text/data)
- `browser_take_screenshot` — see the page visually
- `browser_click` / `browser_type` / `browser_fill_form` — interact with forms and buttons
- `browser_wait_for` — wait for elements to appear after navigation

**Example flow:** After deploying a bill change → `browser_navigate` to the bills page → log in → open a bill → `browser_snapshot` to confirm lot # appears next to description.

### Backend server — API verification
Use when you need to test a backend change locally before pushing to Koyeb.

**Start the server:**
```bash
# Run in background so you can keep working
cd backend && uvicorn app.main:app --reload --port 8000
# (use run_in_background=true on the Bash tool)
```

**Then test with curl:**
```bash
# Login
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Hit any endpoint
curl -s http://localhost:8000/api/v1/bills/?size=1 \
  -H "Authorization: Bearer <token>"
```

**When to use:** When adding or changing an API endpoint — start the server, hit the endpoint with curl, confirm the response shape before pushing.

---

## Common Commands

```bash
# Backend dev
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend dev
cd frontend && npm run dev

# New migration
cd backend && alembic revision --autogenerate -m "describe" && alembic upgrade head

# Verify backend boots (run before every push)
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"

# Force-redeploy frontend
cd frontend && npx vercel --prod --yes

# Smoke test
cd backend && python test_smoke.py --base-url http://localhost:8000/api/v1
```
