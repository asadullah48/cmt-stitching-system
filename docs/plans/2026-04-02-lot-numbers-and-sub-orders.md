# Lot Numbers & Sub-Orders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-party lot number sequencing to orders, and support optional A/B sub-orders where the B sub-order tracks fixed packing stages (Packing → Loading → Ready to Invoice → Invoiced), with user-selectable stages per sub-order.

**Architecture:** New columns on `cmt_orders` handle both features — `lot_number` is auto-assigned on create (party_id + party_reference scoped), `sub_suffix`/`parent_order_id`/`sub_stages`/`current_stage` handle sub-orders. A new PATCH endpoint advances the sub-order stage. Frontend shows Lot # in list/detail, and a stage tracker on B sub-order detail pages.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Next.js 15, TypeScript, TailwindCSS v4

---

## Task 1: Database Migration

**Files:**
- Create: `backend/alembic/versions/s9n0o1p2q3r4_add_lot_and_suborder.py`

**Step 1: Create migration file**

Use absolute path. File content:

```python
"""add lot number and sub-order columns

Revision ID: s9n0o1p2q3r4
Revises: r8m9n0o1p2q3
Create Date: 2026-04-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = 's9n0o1p2q3r4'
down_revision = 'r8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('cmt_orders', sa.Column('lot_number', sa.Integer(), nullable=True))
    op.add_column('cmt_orders', sa.Column('sub_suffix', sa.String(5), nullable=True))
    op.add_column('cmt_orders', sa.Column('parent_order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=True))
    op.add_column('cmt_orders', sa.Column('sub_stages', JSONB(), nullable=True))
    op.add_column('cmt_orders', sa.Column('current_stage', sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_orders', 'current_stage')
    op.drop_column('cmt_orders', 'sub_stages')
    op.drop_column('cmt_orders', 'parent_order_id')
    op.drop_column('cmt_orders', 'sub_suffix')
    op.drop_column('cmt_orders', 'lot_number')
```

**Step 2: Run migration**

```bash
cd backend && alembic upgrade head
```

Expected: `Running upgrade r8m9n0o1p2q3 -> s9n0o1p2q3r4`

**Step 3: Commit**

```bash
git add backend/alembic/versions/s9n0o1p2q3r4_add_lot_and_suborder.py
git commit -m "chore: migration — add lot_number and sub-order columns to cmt_orders"
```

---

## Task 2: Backend Model Update

**Files:**
- Modify: `backend/app/models/orders.py`

**Step 1: Add new columns to Order model**

After `loading_charges` line, add:

```python
    # Lot number — auto-assigned per party + party_reference on create; editable manually
    lot_number = Column(Integer, nullable=True)
    # Sub-order support: suffix "A" or "B", parent link, and stage tracking for B
    sub_suffix = Column(String(5), nullable=True)
    parent_order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    sub_stages = Column(JSON, nullable=True)   # list of selected stage keys e.g. ["packing","invoiced"]
    current_stage = Column(String(30), nullable=True)
```

Also add `JSON` to the SQLAlchemy import at the top:

```python
from sqlalchemy import Column, String, Integer, Numeric, Date, Text, ForeignKey, JSON
```

And add self-referential relationship after existing relationships:

```python
    sub_orders = relationship("Order", foreign_keys="Order.parent_order_id", backref="parent_order")
```

**Step 2: Restart backend to verify no import errors**

```bash
cd backend && python -c "from app.models.orders import Order; print('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/models/orders.py
git commit -m "feat: add lot_number and sub-order fields to Order model"
```

---

## Task 3: Backend Schemas Update

**Files:**
- Modify: `backend/app/schemas/orders.py`

**Step 1: Add fields to OrderCreate**

Add after `product_id`:

```python
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None           # "A" or "B"
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None     # subset of ["packing","loading","ready_to_invoice","invoiced"]
```

**Step 2: Add fields to OrderUpdate**

Add after `product_id`:

```python
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None
    current_stage: Optional[str] = None
```

**Step 3: Add fields to OrderOut**

Add after `product_name`:

```python
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None
    current_stage: Optional[str] = None
```

**Step 4: Add new schema for stage advancement**

At the bottom of the file:

```python
SUB_ORDER_STAGES = ["packing", "loading", "ready_to_invoice", "invoiced"]

class SubOrderStageAdvance(BaseModel):
    """Advance a B sub-order to the next stage, or set a specific stage."""
    stage: str  # must be one of SUB_ORDER_STAGES
```

**Step 5: Verify**

```bash
cd backend && python -c "from app.schemas.orders import OrderOut, SubOrderStageAdvance; print('OK')"
```

Expected: `OK`

**Step 6: Commit**

```bash
git add backend/app/schemas/orders.py
git commit -m "feat: add lot_number and sub-order fields to order schemas"
```

---

## Task 4: Backend Service — Lot Number Logic

**Files:**
- Modify: `backend/app/services/order_service.py`

**Step 1: Add lot number helper to OrderService**

Add this static method inside `OrderService` class, before `create`:

```python
    @staticmethod
    def _assign_lot_number(db: Session, party_id, party_reference: str) -> int:
        """Return the next lot number for a given party + party_reference (case-insensitive)."""
        from sqlalchemy import func
        count = (
            db.query(func.count(Order.id))
            .filter(
                Order.party_id == party_id,
                func.lower(Order.party_reference) == party_reference.strip().lower(),
                Order.is_deleted.is_(False),
            )
            .scalar()
        ) or 0
        return count + 1
```

**Step 2: Use it in `create` method**

In `OrderService.create`, after `order_number = OrderService._generate_order_number(db)`, add:

```python
        # Auto-assign lot number if party + party_reference provided
        lot_number = None
        if data.party_id and data.party_reference:
            lot_number = OrderService._assign_lot_number(db, data.party_id, data.party_reference)
        # Allow manual override
        if data.lot_number is not None:
            lot_number = data.lot_number
```

Then add `lot_number=lot_number,` and the new sub-order fields to the `Order(...)` constructor:

```python
        order = Order(
            order_number=order_number,
            product_id=data.product_id,
            party_id=data.party_id,
            party_reference=data.party_reference,
            lot_number=lot_number,
            sub_suffix=data.sub_suffix,
            parent_order_id=data.parent_order_id,
            sub_stages=data.sub_stages,
            current_stage=data.sub_stages[0] if data.sub_stages else None,
            goods_description=data.goods_description,
            total_quantity=data.total_quantity,
            stitch_rate_party=data.stitch_rate_party,
            stitch_rate_labor=data.stitch_rate_labor,
            pack_rate_party=data.pack_rate_party,
            pack_rate_labor=data.pack_rate_labor,
            entry_date=data.entry_date,
            arrival_date=data.arrival_date,
            delivery_date=data.delivery_date,
            estimated_completion=data.estimated_completion,
            transport_expense=data.transport_expense,
            loading_expense=data.loading_expense,
            miscellaneous_expense=data.miscellaneous_expense,
            rent=data.rent,
            loading_charges=data.loading_charges,
            created_by=user_id,
        )
```

**Step 3: Support lot_number + sub-order fields in `update` method**

Find the `update` method in order_service.py and add handling for the new fields wherever other optional fields are patched (pattern: `if data.field is not None: order.field = data.field`):

```python
        if data.lot_number is not None:
            order.lot_number = data.lot_number
        if data.sub_suffix is not None:
            order.sub_suffix = data.sub_suffix
        if data.parent_order_id is not None:
            order.parent_order_id = data.parent_order_id
        if data.sub_stages is not None:
            order.sub_stages = data.sub_stages
        if data.current_stage is not None:
            order.current_stage = data.current_stage
```

**Step 4: Verify**

```bash
cd backend && python -c "from app.services.order_service import OrderService; print('OK')"
```

Expected: `OK`

**Step 5: Commit**

```bash
git add backend/app/services/order_service.py
git commit -m "feat: auto-assign lot numbers and persist sub-order fields on order create/update"
```

---

## Task 5: Backend Endpoint — _to_out + Stage Advance

**Files:**
- Modify: `backend/app/api/v1/endpoints/orders.py`

**Step 1: Update `_to_out` to include new fields**

In the `_to_out` function, add after `product_name`:

```python
        lot_number=order.lot_number,
        sub_suffix=order.sub_suffix,
        parent_order_id=order.parent_order_id,
        sub_stages=order.sub_stages,
        current_stage=order.current_stage,
```

**Step 2: Add import for new schema**

Add `SubOrderStageAdvance` to the schemas import line:

```python
from app.schemas.orders import (
    OrderCreate, OrderUpdate, OrderStatusUpdate,
    OrderOut, OrderListResponse, OrderItemCreate, OrderItemUpdate,
    SubOrderStageAdvance,
)
```

**Step 3: Add stage-advance endpoint**

Add this endpoint after the existing `PATCH /{order_id}/status` endpoint:

```python
@router.patch("/{order_id}/advance-stage", response_model=OrderOut)
def advance_sub_order_stage(
    order_id: UUID,
    body: SubOrderStageAdvance,
    db: DbDep,
    _: CurrentUser,
):
    """Set the current_stage on a B sub-order. Stage must be in the order's sub_stages list."""
    from app.schemas.orders import SUB_ORDER_STAGES
    order = db.query(Order).options(
        joinedload(Order.items), joinedload(Order.party), joinedload(Order.product)
    ).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.sub_suffix != "B":
        raise HTTPException(status_code=400, detail="Stage advancement is only for B sub-orders")
    if body.stage not in SUB_ORDER_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {SUB_ORDER_STAGES}")
    if order.sub_stages and body.stage not in order.sub_stages:
        raise HTTPException(status_code=400, detail="Stage not in this sub-order's selected stages")
    order.current_stage = body.stage
    db.commit()
    db.refresh(order)
    return _to_out(order)
```

**Step 4: Verify server starts**

```bash
cd backend && python -c "from app.api.v1.endpoints.orders import router; print('OK')"
```

Expected: `OK`

**Step 5: Commit**

```bash
git add backend/app/api/v1/endpoints/orders.py
git commit -m "feat: expose lot_number/sub-order fields in order responses + stage-advance endpoint"
```

---

## Task 6: Frontend Types (BOTH files)

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/tpes.tsx`  ← intentional typo, must update both

**Step 1: Update `Order` interface in types.ts**

After `loading_charges: number | null;` add:

```typescript
  lot_number: number | null;
  sub_suffix: string | null;
  parent_order_id: string | null;
  sub_stages: string[] | null;
  current_stage: string | null;
```

**Step 2: Update `OrderCreate` interface in types.ts**

After `loading_charges?: number;` add:

```typescript
  lot_number?: number;
  sub_suffix?: string;
  parent_order_id?: string;
  sub_stages?: string[];
```

**Step 3: Apply identical changes to tpes.tsx**

Open `frontend/src/hooks/tpes.tsx`, find the `Order` interface and `OrderCreate` interface, apply the exact same additions as steps 1 and 2.

**Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors related to Order/lot_number

**Step 5: Commit**

```bash
git add frontend/src/hooks/types.ts frontend/src/hooks/tpes.tsx
git commit -m "feat: add lot_number and sub-order fields to Order types"
```

---

## Task 7: Frontend Services (BOTH files)

**Files:**
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

**Step 1: Add `advanceStage` to ordersService in services.ts**

Find the `ordersService` object and add after `updateOrderStatus`:

```typescript
  advanceStage: (id: string, stage: string): Promise<Order> =>
    api.patch<Order>(`/orders/${id}/advance-stage`, { stage }).then((r) => r.data),
```

**Step 2: Apply identical change to services.tsx**

Find ordersService in services.tsx, add the same `advanceStage` method.

**Step 3: Commit**

```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: add advanceStage to ordersService"
```

---

## Task 8: Frontend — Order Form (create + edit)

The order form lives in `frontend/src/components/orders.tsx` (the `OrderForm` component).

**Files:**
- Modify: `frontend/src/components/orders.tsx`

**Step 1: Read the current OrderForm component**

Read `frontend/src/components/orders.tsx` to find where `party_reference` is rendered in the form.

**Step 2: Add lot_number field to the edit form**

`lot_number` should be a simple number input, shown only when editing (not creating — creation auto-assigns). Find where `party_reference` input is rendered and add below it:

```tsx
{isEdit && (
  <FormField label="Lot #">
    <Input
      type="number"
      min="1"
      placeholder="Auto-assigned (edit to override)"
      value={form.lot_number ?? ""}
      onChange={(e) => setForm((f) => ({ ...f, lot_number: e.target.value ? parseInt(e.target.value) : null }))}
    />
  </FormField>
)}
```

The form state and `OrderUpdate` type already accept `lot_number` after Task 6.

**Step 3: Commit**

```bash
git add frontend/src/components/orders.tsx
git commit -m "feat: add editable lot_number field to order edit form"
```

---

## Task 9: Frontend — Create Sub-Order Flow

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Read the order detail page action buttons section**

Read `frontend/src/app/(dashboard)/orders/[id]/page.tsx` around line 600–700 to find the existing action buttons area.

**Step 2: Add "Create Sub-Order B" button**

Show this button only when:
- The current order has NO `sub_suffix` (it's a main order, not already a B)
- The current order has no existing B sub-order linked to it

Add a button that opens a small sheet/modal with:
- Checkboxes for each stage: Packing, Loading, Ready to Invoice, Invoiced
- At least one stage must be selected
- On submit: calls `ordersService.createOrder` with:
  ```typescript
  {
    // inherit party, goods_description, entry_date etc. from parent
    party_id: order.party_id ?? undefined,
    party_reference: order.party_reference ?? undefined,
    goods_description: order.goods_description,
    total_quantity: order.total_quantity,
    stitch_rate_party: order.stitch_rate_party,
    stitch_rate_labor: order.stitch_rate_labor,
    entry_date: order.entry_date,
    items: order.items.map(i => ({ size: i.size, quantity: i.quantity })),
    sub_suffix: "B",
    parent_order_id: order.id,
    sub_stages: selectedStages,  // from checkboxes
  }
  ```
- On success: navigate to the new sub-order's page

The stage pool constants to use:
```typescript
const PACKING_STAGE_OPTIONS = [
  { key: "packing", label: "Packing" },
  { key: "loading", label: "Loading" },
  { key: "ready_to_invoice", label: "Ready to Invoice" },
  { key: "invoiced", label: "Invoiced" },
];
```

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/orders/[id]/page.tsx
git commit -m "feat: add Create Sub-Order B button and sheet on order detail page"
```

---

## Task 10: Frontend — Sub-Order B Stage Tracker

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Show stage tracker for B sub-orders**

When `order.sub_suffix === "B"` and `order.sub_stages` exists, replace (or supplement) the existing 4-step production progress bar with a new stage tracker showing only the selected stages.

Add this component inline at the top of the file (before the main export):

```tsx
function SubOrderStageTracker({
  order,
  onStageChange,
}: {
  order: Order;
  onStageChange: () => void;
}) {
  const { showToast } = useToast();
  const stages = order.sub_stages ?? [];
  const current = order.current_stage;

  const advance = async (stage: string) => {
    try {
      await ordersService.advanceStage(order.id, stage);
      showToast("Stage updated");
      onStageChange();
    } catch {
      showToast("Failed to update stage", "error");
    }
  };

  const stageLabels: Record<string, string> = {
    packing: "Packing",
    loading: "Loading",
    ready_to_invoice: "Ready to Invoice",
    invoiced: "Invoiced",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sub-Order Progress</h3>
      <div className="flex items-center gap-2 flex-wrap">
        {stages.map((stage, idx) => {
          const isDone = current ? stages.indexOf(current) >= idx : false;
          const isCurrent = stage === current;
          return (
            <React.Fragment key={stage}>
              <button
                onClick={() => advance(stage)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isCurrent
                    ? "bg-blue-600 text-white"
                    : isDone
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {stageLabels[stage] ?? stage}
              </button>
              {idx < stages.length - 1 && (
                <span className="text-gray-300 text-xs">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
```

Render it in the order detail page when `order.sub_suffix === "B"`, in place of the standard production stage bar.

**Step 2: Commit**

```bash
git add frontend/src/app/(dashboard)/orders/[id]/page.tsx
git commit -m "feat: sub-order B stage tracker with click-to-advance"
```

---

## Task 11: Frontend — Show Lot # in Order List and Detail

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/page.tsx`
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Order list — add Lot # column**

In `orders/page.tsx`, find the table header row and add a "Lot #" column header. In the table body, add the cell:

```tsx
<td className="px-4 py-3 text-gray-500 text-xs">
  {order.lot_number ? `Lot #${order.lot_number}` : "—"}
</td>
```

Also show sub_suffix badge next to order_number if present:

```tsx
{order.order_number}
{order.sub_suffix && (
  <span className="ml-1.5 text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
    {order.sub_suffix}
  </span>
)}
```

**Step 2: Order detail — show lot # in the info grid**

In `orders/[id]/page.tsx`, find where `party_reference` is displayed in the order metadata grid. Add next to it:

```tsx
{order.lot_number && (
  <div>
    <span className="text-xs text-gray-500">Lot #</span>
    <p className="font-semibold text-gray-900">{order.lot_number}</p>
  </div>
)}
```

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/orders/page.tsx frontend/src/app/(dashboard)/orders/[id]/page.tsx
git commit -m "feat: display lot number and sub-suffix in order list and detail views"
```

---

## Task 12: Frontend — bills/new auto-calc for B sub-orders

**Files:**
- Modify: `frontend/src/app/(dashboard)/bills/new/page.tsx`

**Step 1: Read current auto-calc logic**

The auto-calc currently computes stitch + pack + accessories. For a B sub-order, the bill is for additional charges only — stitch/pack rates don't apply. The auto-calc should skip the stitch/pack calculation when `order.sub_suffix === "B"`.

Find the order auto-calc `useEffect` and add a guard:

```typescript
  useEffect(() => {
    if (!form.order_id) return;
    const order = orders.find((o) => o.id === form.order_id);
    if (!order) return;

    // B sub-orders: no auto stitch/pack calc — amounts entered manually
    if ((order as any).sub_suffix === "B") {
      setSubtotal(0);
      setForm((f) => ({ ...f, amount_due: 0 }));
      return;
    }

    // existing logic continues...
  }, [form.order_id, orders]);
```

**Step 2: Commit**

```bash
git add frontend/src/app/(dashboard)/bills/new/page.tsx
git commit -m "feat: skip stitch/pack auto-calc for B sub-order bills"
```

---

## Task 13: Smoke Test & Deploy

**Step 1: Run backend smoke test**

```bash
cd backend && python test_smoke.py --base-url http://localhost:8000/api/v1
```

Expected: all endpoints pass (or pre-existing failures only)

**Step 2: Run frontend dev server**

```bash
cd frontend && npm run dev
```

Manually verify:
- Create an order with party_reference = "bedrail" → shows Lot #1
- Create another "bedrail" order for same party → shows Lot #2
- Same "bedrail" for a different party → shows Lot #1
- Open an order detail → "Create Sub-Order B" button visible
- Create sub-order B, select 2 stages → navigates to new order
- Sub-order B detail shows 2-step stage tracker, click advances stage
- Edit existing order → Lot # field visible and editable

**Step 3: Push to deploy**

```bash
git push origin chore/cleanup-assets-and-plans
```

Frontend auto-deploys to Vercel. Backend deploys to Koyeb on push to master (or trigger manually).
