# Smoke Test Results — 2026-03-14

**Script:** `backend/test_smoke.py`
**Run against:** `http://127.0.0.1:8001/api/v1` (local, connected to Neon DB)
**Result: 48/48 PASSED**

## How to re-run

```bash
cd backend
# Against local server:
PYTHONIOENCODING=utf-8 python test_smoke.py --base-url http://127.0.0.1:8001/api/v1

# Against production (requires correct ADMIN_PASSWORD on Render):
PYTHONIOENCODING=utf-8 python test_smoke.py

# Keep test data (skip cleanup):
PYTHONIOENCODING=utf-8 python test_smoke.py --keep
```

## Endpoints Covered (48 checks)

| Section | Checks |
|---------|--------|
| Auth | GET /auth/me |
| Parties | GET list, POST create, GET by id, PUT update, GET ledger |
| Orders | GET list, POST create, GET by id, PUT update, PATCH status x4 |
| Production | POST session, GET by order |
| Inventory | GET categories, POST category, GET items, POST item, PATCH adjust x2, PUT item |
| Transactions | GET list, POST x6 types (income/payment/expense/purchase/stock_consumption/adjustment), GET filter x2 |
| Bills | GET next-number, GET list, POST create, GET by id, PATCH update, PATCH payment, DELETE + order revert check |
| Expenses | POST create, GET filter by order |
| Quality | GET report, PATCH checkpoint, POST defect |
| Dispatch | GET ready, GET carriers |
| Dashboard | GET summary |

## Bugs Fixed During This Run

| Bug | Fix |
|-----|-----|
| `GET /quality/{id}` 500 — `deleted_at` column missing | Migration `l2g3h4i5j6k7`: added `deleted_at` to `cmt_quality_checkpoints` and `cmt_defect_logs` |
| `POST /bills/` 500 — duplicate bill number after delete | Migration `m3h4i5j6k7l8`: replaced global unique constraint with partial index (`WHERE is_deleted = false`) |
| `POST /orders/` 422 — `entry_date` required | Added `entry_date` to smoke test payload |
| `POST /production/` 422 — `machines_used` required | Added `machines_used`, removed non-existent `quantity_completed` |
| `PATCH /orders/{id}` 405 — wrong HTTP method | Changed to `PUT /orders/{id}` |
| Quality `PATCH` 422 — wrong field name | Changed `status: "passed"` → `passed: true` |
| Inventory duplicate SKU on re-run | Use timestamped SKU `TEST-ZIP-{timestamp}` |
