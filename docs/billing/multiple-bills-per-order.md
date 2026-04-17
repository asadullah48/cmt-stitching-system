# Multiple Bills Per Order Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow creating more than one bill against the same order so accessories/material charges can be posted to the party ledger separately from the stitching/packing bill.

**Architecture:** Two targeted changes — remove the hard "one bill per order" guard in the service layer, prevent re-dispatching an already-dispatched order on a second bill, and widen the order dropdown in the new-bill form to include dispatched orders (since the first bill will have already dispatched the order before the accessories bill is created).

**Tech Stack:** FastAPI / SQLAlchemy (backend), Next.js 15 / TypeScript (frontend). No migration needed — no schema changes.

---

### Task 1: Backend — remove the 1-bill-per-order guard

**Files:**
- Modify: `backend/app/services/bill_service.py:117-123`

**Step 1: Remove the duplicate-bill guard**

In `bill_service.py`, delete lines 117-123:

```python
            existing = (
                db.query(Bill)
                .filter(Bill.order_id == data.order_id, Bill.is_deleted.is_(False))
                .first()
            )
            if existing:
                raise ValueError(f"Order already has bill {existing.bill_number}")
```

**Step 2: Prevent re-dispatching an already-dispatched order**

The block at line ~179 currently unconditionally sets `order.status = "dispatched"` whenever any bill is created for an order. A second bill must not overwrite dispatch date/status. Change:

```python
        # Mark order dispatched (only for order-linked bills)
        if order:
            order.status = "dispatched"
            order.dispatch_date = data.bill_date
            order.actual_completion = data.bill_date
```

to:

```python
        # Mark order dispatched on first bill only
        if order and order.status != "dispatched":
            order.status = "dispatched"
            order.dispatch_date = data.bill_date
            order.actual_completion = data.bill_date
```

**Step 3: Smoke-test manually**

Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`

1. Create a bill for an existing order → should work as before, order goes to dispatched.
2. Create a second bill for the same order → should succeed, order stays dispatched, a second income ledger entry is posted.

**Step 4: Commit**

```bash
git add backend/app/services/bill_service.py
git commit -m "feat: allow multiple bills per order (accessories/materials)"
```

---

### Task 2: Frontend — include dispatched orders in the dropdown

**Files:**
- Modify: `frontend/src/app/(dashboard)/bills/new/page.tsx:51-52,224-227`

**Context:** The new-bill form currently filters out dispatched orders:
```ts
const eligible = all.filter((o) => o.status !== "dispatched");
```
Since the stitching bill dispatches the order, a user trying to create a second (accessories) bill will find the order missing from the dropdown.

**Step 1: Remove the dispatched filter**

Change:
```ts
        const eligible = all.filter((o) => o.status !== "dispatched");
        setOrders(eligible);
```
to:
```ts
        setOrders(all);
```

**Step 2: Update the empty-state hint text**

The old hint assumed only unbilled orders were shown. Change:
```tsx
                {!loadingOrders && orders.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No unbilled orders found. Already dispatched orders are excluded.
                  </p>
                )}
```
to:
```tsx
                {!loadingOrders && orders.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No orders found.
                  </p>
                )}
```

**Step 3: Update the page subtitle so it's accurate for second bills**

Change:
```tsx
          {billType === "order"
            ? "Creates dispatch record, updates ledger & marks order complete"
            : "Standalone misc bill — posts to party ledger, no order required"}
```
to:
```tsx
          {billType === "order"
            ? "Posts to party ledger & links to order. First bill also marks order dispatched."
            : "Standalone misc bill — posts to party ledger, no order required"}
```

**Step 4: Verify in browser**

1. Open `/bills/new`, pick "Linked to Order".
2. Confirm a dispatched order now appears in the list (with status shown in the option label).
3. Select it — amount auto-calculates (user overrides to the accessories amount).
4. Submit — second bill created, ledger shows two income entries for the same order.

**Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/bills/new/page.tsx
git commit -m "feat: show dispatched orders in bill-creation dropdown for secondary bills"
```

---

## Usage After This Change

**Workflow for Lot #1 Bedrail:**

| Bill | Amount | Purpose |
|------|--------|---------|
| Bill A (e.g. A47) | 138,105 | Stitching + packing — created first, auto-dispatches order |
| Bill B (e.g. A48) | 35,000  | Accessories/zips — created second, use `notes` field to label |

Both bills appear in the party ledger under the same order number and lot #. Both carry the lot number on the invoice (from the `lot_number` + `sub_suffix` fields added in the previous session).

For **CMT-paid supplier expenses** (not billed to party) — use the existing Expenses module linked to the order. These appear in the job card cost analysis but not in the party ledger, which is correct.
