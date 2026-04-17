# Standalone Bills (no order required) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow bills to be created without a linked order, for miscellaneous charges billed directly to a party.

**Architecture:** Make `order_id` nullable in the Bill model/schema/DB. When `order_id` is None the service skips order-dispatch logic and uses `party_id` + `description` supplied directly on the create payload. The frontend adds a toggle: "Linked to order" vs "Standalone (misc)" which shows different fields.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Next.js 15 + TypeScript (frontend)

---

### Task 1: Database migration — make `order_id` nullable on `cmt_bills`

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\q7l8m9n0o1p2_standalone_bills.py`

**Step 1: Write the migration file**

```python
"""standalone bills — make order_id nullable

Revision ID: q7l8m9n0o1p2
Revises: p6k7l8m9n0o1
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'q7l8m9n0o1p2'
down_revision = 'p6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('cmt_bills', 'order_id', nullable=True)


def downgrade() -> None:
    op.alter_column('cmt_bills', 'order_id', nullable=False)
```

**Step 2: Run migration**

```bash
cd C:\Users\Asad\cmt-stitching-system\backend
alembic upgrade head
```

Expected: `Running upgrade p6k7l8m9n0o1 -> q7l8m9n0o1p2`

**Step 3: Commit**

```bash
git add C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\q7l8m9n0o1p2_standalone_bills.py
git commit -m "feat: migration — make cmt_bills.order_id nullable for standalone bills"
```

---

### Task 2: Backend model + schema

**Files:**
- Modify: `backend/app/models/bill.py` — `order_id` nullable
- Modify: `backend/app/schemas/bill.py` — `order_id` optional, add `party_id` + `description`

**Step 1: Update `bill.py` model**

In `backend/app/models/bill.py`, change:
```python
order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
```
to:
```python
order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
```

**Step 2: Update `BillCreate` schema**

In `backend/app/schemas/bill.py`:

Replace:
```python
class BillCreate(BaseModel):
    order_id: UUID
```
with:
```python
class BillCreate(BaseModel):
    order_id: Optional[UUID] = None
    party_id: Optional[UUID] = None       # required when order_id is None
    description: Optional[str] = None    # used as ledger description for standalone bills
```

Add a validator after the existing `bill_number_or_series` validator:
```python
    @model_validator(mode="after")
    def standalone_requires_party(self):
        if self.order_id is None and self.party_id is None:
            raise ValueError("party_id is required when order_id is not provided")
        return self
```

Also update `BillOut`:
```python
    order_id: Optional[UUID] = None
```

**Step 3: Commit**

```bash
git add backend/app/models/bill.py backend/app/schemas/bill.py
git commit -m "feat: bill model/schema — order_id optional, add party_id + description for standalone"
```

---

### Task 3: Backend service — handle standalone bills

**Files:**
- Modify: `backend/app/services/bill_service.py`

**Step 1: Update `BillService.create()`**

Replace the entire `create()` method body with the version below. The key differences when `data.order_id is None`:
- Skip order fetch and duplicate-order-bill check
- Use `data.party_id` directly instead of `order.party_id`
- Skip "mark order as dispatched"
- Use `data.description` for the income transaction

```python
@staticmethod
def create(db: Session, data: BillCreate, user_id: UUID) -> Bill:
    party_id = None
    order = None

    if data.order_id is not None:
        # --- Order-linked bill (existing logic) ---
        order = (
            db.query(Order)
            .options(joinedload(Order.party))
            .filter(Order.id == data.order_id, Order.is_deleted.is_(False))
            .first()
        )
        if not order:
            raise ValueError("Order not found")

        existing = (
            db.query(Bill)
            .filter(Bill.order_id == data.order_id, Bill.is_deleted.is_(False))
            .first()
        )
        if existing:
            raise ValueError(f"Order already has bill {existing.bill_number}")

        party_id = order.party_id
    else:
        # --- Standalone bill ---
        party_id = data.party_id

    # Resolve bill number
    if data.bill_number:
        dup = (
            db.query(Bill)
            .filter(Bill.bill_number == data.bill_number, Bill.is_deleted.is_(False))
            .first()
        )
        if dup:
            raise ValueError(f"Bill number {data.bill_number} already exists")
        series, seq = BillService._parse_manual_number(data.bill_number)
        bill_number = data.bill_number
    else:
        bill_number, seq = BillService.next_number(db, data.bill_series)
        series = data.bill_series.upper()

    # Capture previous balance
    captured_previous_balance = Decimal("0")
    if party_id:
        pre_party = db.query(Party).filter(Party.id == party_id).first()
        if pre_party:
            captured_previous_balance = Decimal(str(pre_party.balance))

    discount = data.discount if data.discount is not None else Decimal("0")

    bill = Bill(
        bill_number=bill_number,
        bill_series=series,
        bill_sequence=seq,
        order_id=data.order_id,
        party_id=party_id,
        bill_date=data.bill_date,
        carrier=data.carrier or (order.carrier if order else None),
        tracking_number=data.tracking_number or (order.tracking_number if order else None),
        carton_count=data.carton_count or (order.carton_count if order else None),
        total_weight=data.total_weight or (order.total_weight if order else None),
        payment_status="unpaid",
        amount_due=data.amount_due,
        amount_paid=Decimal("0"),
        discount=discount,
        previous_balance=captured_previous_balance,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(bill)
    db.flush()

    # Mark order dispatched (only for order-linked bills)
    if order:
        order.status = "dispatched"
        order.dispatch_date = data.bill_date
        order.actual_completion = data.bill_date

    # Post income ledger entry
    if party_id:
        desc = data.description or (
            f"Bill #{bill_number} — {order.goods_description}" if order
            else f"Bill #{bill_number}"
        )
        txn = FinancialTransaction(
            party_id=party_id,
            order_id=data.order_id,
            transaction_type="income",
            amount=data.amount_due,
            reference_number=bill_number,
            description=desc,
            transaction_date=data.bill_date,
            created_by=user_id,
        )
        db.add(txn)
        db.flush()

        party = (
            db.query(Party)
            .filter(Party.id == party_id)
            .with_for_update()
            .first()
        )
        if party:
            party.balance += data.amount_due

    AuditService.log_create(
        db,
        "cmt_bills",
        bill.id,
        {"bill_number": bill_number, "amount_due": str(data.amount_due)},
        user_id,
    )

    db.commit()
    db.refresh(bill)
    return bill
```

**Step 2: Update `BillService.delete()`**

The income transaction reversal query currently filters on `order_id`. For standalone bills `order_id` is None so we need to match on `bill_id` instead. Update the income_txn lookup:

Replace:
```python
        income_txn = (
            db.query(FinancialTransaction)
            .filter(
                FinancialTransaction.order_id == bill.order_id,
                FinancialTransaction.transaction_type == "income",
                FinancialTransaction.reference_number == bill.bill_number,
                FinancialTransaction.is_deleted.is_(False),
            )
            .first()
        )
```
with:
```python
        income_txn = (
            db.query(FinancialTransaction)
            .filter(
                FinancialTransaction.transaction_type == "income",
                FinancialTransaction.reference_number == bill.bill_number,
                FinancialTransaction.party_id == bill.party_id,
                FinancialTransaction.is_deleted.is_(False),
            )
            .first()
        )
```

Also guard the order-revert block (already has `if bill.order:` — confirm it does, no change needed if so).

**Step 3: Commit**

```bash
git add backend/app/services/bill_service.py
git commit -m "feat: bill service — support standalone bills with no order_id"
```

---

### Task 4: Frontend types — `services.ts` + `services.tsx`

**Files:**
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

Apply identical changes to BOTH files:

**Change 1:** `Bill.order_id` — make nullable:
```typescript
// Before
order_id: string;
// After
order_id: string | null;
```

**Change 2:** `BillCreate` — make `order_id` optional, add `party_id` + `description`:
```typescript
// Before
export interface BillCreate {
  order_id: string;
  ...
}
// After
export interface BillCreate {
  order_id?: string;
  party_id?: string;
  description?: string;
  ...
}
```

**Step 1: Edit `services.ts`** — apply both changes above.

**Step 2: Edit `services.tsx`** — apply the same changes.

**Step 3: Commit**

```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: bill types — order_id optional, add party_id + description for standalone"
```

---

### Task 5: Frontend — new bill form supports standalone mode

**Files:**
- Modify: `frontend/src/app/(dashboard)/bills/new/page.tsx`

**Goal:** Add a "Standalone (misc)" mode toggle. When selected:
- Order selector is hidden
- Party selector appears (required)
- Description field appears (required — becomes the ledger description)
- Amount Due is entered manually (no auto-calc from order rates)
- Subtotal summary is hidden

**Step 1: Add `billType` state and party loading**

After the existing state declarations, add:
```typescript
const [billType, setBillType] = useState<"order" | "standalone">(
  urlOrderId ? "order" : "order"
);
const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
```

Load parties in the existing `useEffect` that loads orders:
```typescript
partiesService.getParties(1, 200).then((r) => setParties(r.data ?? [])).catch(() => {});
```

Import `partiesService` — it is already exported from `@/hooks/services`.

**Step 2: Update form state initial value**

Add `party_id` and `description` fields to the form initial state:
```typescript
const [form, setForm] = useState<BillCreate & { discount: number }>({
  order_id: urlOrderId,
  party_id: "",
  description: "",
  bill_number: "",
  bill_series: "A",
  bill_date: new Date().toISOString().split("T")[0],
  amount_due: 0,
  discount: 0,
});
```

**Step 3: Update `handleSubmit` payload**

```typescript
const payload: BillCreate = {
  ...form,
  order_id: billType === "order" ? form.order_id : undefined,
  party_id: billType === "standalone" ? form.party_id : undefined,
  description: billType === "standalone" ? form.description : undefined,
  bill_number: autoMode ? undefined : form.bill_number,
  discount: form.discount || 0,
};
```

Also update validation — for standalone mode, `order_id` should not be required:
```typescript
if (billType === "order" && !form.order_id) {
  showToast("Select an order", "error");
  return;
}
if (billType === "standalone" && !form.party_id) {
  showToast("Select a party", "error");
  return;
}
```

**Step 4: Update the JSX**

Replace the page title description line:
```tsx
<p className="text-sm text-gray-500 mt-0.5">
  Creates dispatch record, updates ledger &amp; marks order complete
</p>
```
with a bill type toggle:
```tsx
<div className="flex gap-3 mt-2">
  {(["order", "standalone"] as const).map((t) => (
    <button
      key={t}
      type="button"
      onClick={() => setBillType(t)}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
        billType === t
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
      }`}
    >
      {t === "order" ? "Linked to Order" : "Standalone (misc)"}
    </button>
  ))}
</div>
```

Wrap the Order selector block in `{billType === "order" && ( ... )}`.

After it, add the standalone fields block:
```tsx
{billType === "standalone" && (
  <>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Party *
      </label>
      <select
        required
        value={form.party_id}
        onChange={(e) => set("party_id", e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="">Select a party...</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Description *
      </label>
      <input
        type="text"
        required
        placeholder="e.g. Misc stitching charges — March 2026"
        value={form.description || ""}
        onChange={(e) => set("description", e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  </>
)}
```

Wrap the subtotal summary in `{billType === "order" && subtotal > 0 && ( ... )}` so it only shows for order-linked bills.

**Step 5: Commit**

```bash
git add frontend/src/app/(dashboard)/bills/new/page.tsx
git commit -m "feat: new bill form — standalone mode for misc bills without an order"
```

---

### Task 6: Smoke test + deploy verification

**Step 1: Test order-linked bill still works**
- Create a bill linked to an order → should behave exactly as before

**Step 2: Test standalone bill creation**
- Go to `/bills/new`, click "Standalone (misc)"
- Select a party, enter description "Test misc charge", set amount 5000
- Submit → should create bill, redirect to bill detail page
- Verify: bill detail shows party name, no order number
- Verify: ledger shows an `income` entry for 5000 linked to that party

**Step 3: Test standalone bill deletion**
- Delete the standalone bill
- Verify: party balance decreases by 5000, income ledger entry is soft-deleted

**Step 4: Push to deploy**

```bash
git push origin master
```

---

## Summary of all changed files

| File | Change |
|------|--------|
| `backend/alembic/versions/q7l8m9n0o1p2_standalone_bills.py` | New migration |
| `backend/app/models/bill.py` | `order_id` nullable |
| `backend/app/schemas/bill.py` | `order_id` optional, add `party_id` + `description` |
| `backend/app/services/bill_service.py` | Standalone path in `create()`, fix `delete()` query |
| `frontend/src/hooks/services.ts` | `order_id` nullable, `BillCreate` updated |
| `frontend/src/hooks/services.tsx` | Same as above |
| `frontend/src/app/(dashboard)/bills/new/page.tsx` | Toggle + standalone fields |
