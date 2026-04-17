# CLAUDE.md — CMT Stitching System

Personal project. 1–5 users, <500 orders/month. Optimise for simplicity, not scale.

Full architecture, file layout, endpoints, and migration chain live in **[AGENTS.md](./AGENTS.md)**. Read that first when onboarding.

---

## Stack (settled — do not change)

- **Frontend:** Next.js 15 · React 19 · TypeScript · TailwindCSS v4 · React Context (no Redux)
- **Backend:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · PostgreSQL (Neon) · Alembic
- **Auth:** JWT — roles `admin | operator | accountant`
- **Package manager (backend):** `uv` — never `pip install`

---

## Critical rules

### Backend

1. **bcrypt direct** — `import bcrypt`, not passlib (Python 3.13).
2. **DATABASE_URL** — `asyncpg://` in `.env`; `database.py` and `alembic/env.py` normalise to `psycopg2://`. Don't break this.
3. **Table prefix** — all CMT tables use `cmt_` (shared Neon DB).
4. **Migrations** — new files under `backend/alembic/versions/` with absolute path. Always append, never modify existing migrations. Current HEAD tracked in AGENTS.md.
5. **Services layer** — business logic in `app/services/`, not in route handlers.
6. **Base import** — ORM models import `Base` from `app.models.base`, never `app.core.database`.
7. **Self-referential FK** — always include `primaryjoin` with `remote()`:
   ```python
   sub_orders = relationship("Order",
       primaryjoin="Order.id == remote(Order.parent_order_id)",
       foreign_keys="[Order.parent_order_id]", backref="parent_order")
   ```
8. **Pydantic ↔ frontend types** — when changing `app/schemas/`, update `frontend/src/hooks/types.ts` in the same change. `TransactionOut` must include `created_at` (party-ledger sort depends on it).
9. **Pagination** — API `size` is capped at 100. Always loop until `len(items) >= total`.

### Frontend

1. **Single hook files** — the old `.tsx` duplicates (`services.tsx`, `utils.tsx`, `tpes.tsx`) were removed. Edit only `services.ts`, `types.ts`, `utils.ts` under `src/hooks/`.
2. **Type-check before push** — `cd frontend && npx tsc --noEmit`. Catches missing imports that only surface at Vercel build time.
3. **useSearchParams** — wrap in `<Suspense>` (Next.js 15).
4. **Dashboard route** — home is `/dashboard`, not `/`.
5. **Forms** — slide-in sheet pattern, not full-page navigation.
6. **Bill accessories** — show only on B-series bills (`bill.bill_series === "B"`). A and C bills never show accessories.
7. **B-series bills need accessory rows** — creating a B-series bill with a manual amount does NOT auto-create `OrderAccessory` rows. The PDF needs them or it falls back to a single summary line. Verify accessories exist on the order.

---

## Bill series (settled)

| Series | Purpose |
|--------|---------|
| **A** | Stitching (`stitch_rate_party × qty`) |
| **B** | Accessories / materials / misc charges |
| **C** | Packing (`pack_rate_party × qty`) |
| **D** | Misc / manual bills |

One order can carry A + B + C, each appearing separately in the party ledger. First bill dispatches the order; subsequent bills skip re-dispatch. Bill delete only reverts status if no other active bills remain.

---

## UI design

- Sidebar `#1a2744` dark navy, 240px fixed · Primary `#2563EB` · BG `#F9FAFB` · Surface `#FFFFFF` · Border `#E5E7EB`
- Cards: `rounded-xl shadow-sm border border-gray-200` · Font: Inter

---

## Code style

- No speculative abstractions — solve what's actually needed.
- No error handling for impossible scenarios.
- No comments on unchanged code.
- Don't add features beyond what's asked.

---

## Verification (state method before coding)

| Change type | Minimum verification |
|-------------|---------------------|
| New / changed endpoint | Boot check + `curl` shape |
| Frontend UI change | `npm run dev` → Playwright navigate + snapshot |
| New types or imports | `npx tsc --noEmit` passes clean |
| Data script | `--dry-run` first, then confirm record counts |
| Migration | `alembic upgrade head` + boot check |
| Deploy | Vercel build output shows `✓ Compiled successfully` |

**Boot check:**
```bash
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('App OK')"
```

**Dev servers:**
```bash
cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev        # http://localhost:3000
```

---

## Deployment

- **Frontend** → Vercel (auto-deploy on push to `master`; force: `cd frontend && npx vercel --prod --yes`)
- **Backend** → Koyeb (auto-deploy on push to `master`)
- **DB** → Neon Postgres (`cmt_` prefix on all tables)
