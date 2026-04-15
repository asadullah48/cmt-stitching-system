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
4. **Migration files** — use ABSOLUTE paths: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\`
5. **Migration HEAD** — currently `860bf63b6a35`; always append, never modify existing migrations
6. **Services layer** — business logic in `app/services/`, not in route handlers
7. **Base import** — ORM models import `Base` from `app.models.base`, never `app.core.database`
8. **Self-referential FK** — always include `primaryjoin` with `remote()`:
   ```python
   sub_orders = relationship("Order",
       primaryjoin="Order.id == remote(Order.parent_order_id)",
       foreign_keys="[Order.parent_order_id]", backref="parent_order")
   ```
9. **Multiple bills per order** — intentional. First bill dispatches; second skips re-dispatch. Bill delete only reverts status if no other active bills remain.
10. **Pydantic schemas must match frontend types** — check `frontend/src/hooks/types.ts` when adding/changing fields in `app/schemas/`. Missing non-optional fields silently break frontend logic. `TransactionOut` must always include `created_at` (party ledger sort depends on it).
11. **API page size limit is 100** — the `size` query param is capped at 100. Always paginate: loop until `len(items) >= total`.

### Frontend

1. **Dual hook files** — ALWAYS update both `.ts` and `.tsx` in `src/hooks/`:
   - `services.ts` + `services.tsx`
   - `types.ts` + `tpes.tsx` (typo in `.tsx` intentional — do not rename)
   - `utils.ts` + `utils.tsx`
2. **useSearchParams** — always wrap in `<Suspense>` (Next.js 15)
3. **Dashboard route** — home is `/dashboard`, not `/`
4. **Forms** — slide-in sheet pattern, not full-page navigation
5. **No Redux** — React Context + useReducer only
6. **Bill accessories** — show only on B-series bills (`bill.bill_series === "B"`). A and C bills never show accessories.

---

## Bill Series Convention (SETTLED)

| Series | Purpose |
|--------|---------|
| **A** | Stitching (`stitch_rate_party × qty`) |
| **B** | Accessories / materials / misc charges |
| **C** | Packing (`pack_rate_party × qty`) |
| **D** | R&D, expenses, one-off charges |

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

## Verification — Required Before Declaring Done

Use the **`cmt-verify`** skill. It covers every change type.

**Always run the boot check first:**
```bash
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"
```

**Feedback loop — verify what you just did:**

After any backend change, hit the affected endpoint and confirm the response shape:
```bash
curl -s http://localhost:8000/api/v1/<endpoint> -H "Authorization: Bearer <token>" | python -m json.tool
```

After any data operation (import/seed script), query the API to confirm records exist and counts match expectations:
```python
# Example: verify 3 new orders exist
orders = paginated_get(session, f"{base}/orders/", {"party_id": party_id})
for num in ["ORD-202604-0032", "ORD-202604-0033", "ORD-202604-0034"]:
    assert any(o["order_number"] == num for o in orders), f"MISSING: {num}"
```

Never declare complete without evidence. "The code looks correct" is not evidence.

---

## One-Time Scripts (import_ledger.py etc.)

- Always `--dry-run` first to confirm what will be created/skipped
- Never run the same script twice concurrently (background + foreground = duplicate records)
- Idempotency depends on reference_number uniqueness — snapshot ALL transaction pages before checking, not just page 1
- After running, query the API to verify record counts and no duplicates
