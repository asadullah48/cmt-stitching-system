# CLAUDE.md — CMT Stitching System

## Project Context

CMT stitching + packing management system. 1–5 users, <500 orders/month. Personal project — optimize for simplicity, not scale.

See `AGENTS.md` for full architecture, file layout, endpoints, and conventions.

---

## Stack (SETTLED — do not change)

- **Frontend:** Next.js 15, TailwindCSS v4, TypeScript, React Context (no Redux)
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2, PostgreSQL, Alembic
- **Auth:** JWT — roles: `admin` | `operator` | `accountant`
- **Backend package manager:** `uv` — never `pip install`

---

## Critical Rules

### Backend

1. **bcrypt direct** — `import bcrypt`, not passlib (Python 3.13 incompatible)
2. **DATABASE_URL** — always `asyncpg://` in .env; `database.py` and `alembic/env.py` normalize to `psycopg2://` — do not break this
3. **Table prefix** — all CMT tables use `cmt_` prefix (shared Neon DB)
4. **Migration files** — use ABSOLUTE paths: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\`. Current HEAD in AGENTS.md — always append, never modify existing migrations.
5. **Services layer** — business logic in `app/services/`, not in route handlers
6. **Base import** — ORM models import `Base` from `app.models.base`, never `app.core.database`
7. **Self-referential FK** — always include `primaryjoin` with `remote()`:
   ```python
   sub_orders = relationship("Order",
       primaryjoin="Order.id == remote(Order.parent_order_id)",
       foreign_keys="[Order.parent_order_id]", backref="parent_order")
   ```
8. **Multiple bills per order** — intentional. First bill dispatches; second skips re-dispatch. Bill delete only reverts status if no other active bills remain.
9. **Pydantic schemas must match frontend types** — check `frontend/src/hooks/types.ts` when adding/changing fields in `app/schemas/`. Missing non-optional fields silently break frontend logic. `TransactionOut` must always include `created_at` (party ledger sort depends on it).
10. **API page size limit is 100** — the `size` query param is capped at 100. Always paginate: loop until `len(items) >= total`.

### Frontend

1. **Dual hook files** — ALWAYS update both `.ts` and `.tsx` in `src/hooks/`:
   - `services.ts` + `services.tsx`
   - `types.ts` + `tpes.tsx` (typo in `.tsx` intentional — do not rename)
   - `utils.ts` + `utils.tsx`
2. **TypeScript check before pushing** — run `npx tsc --noEmit` in `frontend/` before every push. Catches missing imports that only surface at Vercel build time.
3. **useSearchParams** — always wrap in `<Suspense>` (Next.js 15)
4. **Dashboard route** — home is `/dashboard`, not `/`
5. **Forms** — slide-in sheet pattern, not full-page navigation
6. **No Redux** — React Context + useReducer only
7. **Bill accessories** — show only on B-series bills (`bill.bill_series === "B"`). A and C bills never show accessories.
8. **B-series bills require accessory records** — creating a B-series bill with a manual amount does NOT auto-create `OrderAccessory` rows. The bill PDF needs accessories in the `cmt_order_accessories` table to display qty/rate/size. Always verify accessories exist on the order before or immediately after creating a B-series bill. Without them, the PDF falls back to a single summary line with no breakdown.

---

## Bill Series Convention (SETTLED)

| Series | Purpose |
|--------|---------|
| **A** | Stitching (`stitch_rate_party × qty`) |
| **B** | Accessories / materials / misc charges |
| **C** | Packing (`pack_rate_party × qty`) |
| D–E   | Reserved |

One order can have up to 3 bills (A + B + C), all linked to the same order, appearing separately in the party ledger.

---

## Code Style

- No speculative abstractions — solve what's actually needed
- No error handling for impossible scenarios
- No docstrings or comments on unchanged code
- Don't add features beyond what's asked

---

## UI Design

- Sidebar: `#1a2744` dark navy, 240px fixed
- Primary: `#2563EB` (blue-600)
- Background: `#F9FAFB`, Surface: `#FFFFFF`, Border: `#E5E7EB`
- Cards: `rounded-xl shadow-sm border border-gray-200`
- Font: Inter

---

## Deployment

- **Frontend** → Vercel (auto-deploy on push to master; force: `cd frontend && npx vercel --prod --yes`)
- **Backend** → Koyeb (auto-deploy on push to master)
- **DB** → Neon PostgreSQL (`cmt_` prefix on all tables)

---

## Verification

**State the verification method before writing any code.** No exceptions. "The code looks correct" is not evidence.

### Tools available

**Backend — start the dev server:**
```bash
cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```
Then curl the affected endpoint to confirm the response shape:
```bash
curl -s http://localhost:8000/api/v1/<endpoint> -H "Authorization: Bearer <token>" | python -m json.tool
```

**Boot check (always run before pushing):**
```bash
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"
```

**Frontend — start the dev server:**
```bash
cd frontend && npm run dev   # runs on http://localhost:3000
```
Then use the **Playwright MCP tool** (`browser_navigate`, `browser_snapshot`, `browser_click`) to open the page, interact with the feature, and confirm the UI renders correctly. Use Playwright for any visible UI change — don't ship without seeing it.

**TypeScript — catch missing imports before Vercel does:**
```bash
cd frontend && npx tsc --noEmit
```

### What to verify per change type

| Change type | Minimum verification |
|-------------|---------------------|
| New/changed endpoint | Boot check + curl response shape |
| Frontend UI change | `npm run dev` → Playwright navigate + snapshot |
| New types or imports | `npx tsc --noEmit` passes clean |
| Data script | `--dry-run` first, then record count matches expectation |
| Migration | `alembic upgrade head` succeeds + boot check passes |
| Deploy | Vercel build output shows `✓ Compiled successfully` |

### One-time scripts (`backend/scripts/`)

- Always `--dry-run` first to confirm what will be created/skipped
- Never run the same script twice concurrently — duplicate records result
- After running, curl the API and verify record counts, not just page 1
