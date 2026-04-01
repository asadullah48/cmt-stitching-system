# Order Accessories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-order accessory line items (zip, thread, etc.) that appear on the party bill and flow into the ledger automatically.

**Architecture:** New `cmt_order_accessories` table stores accessory charges per order. A new `/orders/{id}/accessories` REST endpoint handles CRUD. The bill page fetches accessories alongside the bill and renders them as extra invoice line items — no change to `amount_due` calculation logic needed since bill creation already uses the order total.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 + Alembic (backend), Next.js 15 + TypeScript + TailwindCSS (frontend)

---

### Task 1: Backend Model

**Files:**
- Modify: `backend/app/models/orders.py`
- Create: `backend/app/models/accessories.py`

**Step 1: Create the model file**

```python
# backend/app/models/accessories.py
from sqlalchemy import Column, String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class OrderAccessory(BaseModel):
    __tablename__ = "cmt_order_accessories"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    name = Column(String(100), nullable=False)
    total_qty = Column(Numeric(10, 2), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    from_stock = Column(Numeric(10, 2), nullable=False, default=0)
    purchased_qty = Column(Numeric(10, 2), nullable=False, default=0)
    purchase_cost = Column(Numeric(10, 2), nullable=True)

    order = relationship("Order", back_populates="accessories")
```

**Step 2: Add relationship to Order model**

In `backend/app/models/orders.py`, add to the `Order` class relationships:
```python
accessories = relationship("OrderAccessory", back_populates="order", cascade="all, delete-orphan")
```

**Step 3: Register model in `backend/app/models/__init__.py`**

Add to the imports (check existing pattern in the file and follow it).

**Step 4: Commit**
```bash
git add backend/app/models/accessories.py backend/app/models/orders.py backend/app/models/__init__.py
git commit -m "feat: add OrderAccessory model"
```

---

### Task 2: Alembic Migration

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\p6k7l8m9n0o1_add_order_accessories.py`

**Step 1: Create migration file** (use ABSOLUTE path)

```python
"""add order accessories table

Revision ID: p6k7l8m9n0o1
Revises: o5j6k7l8m9n0
Create Date: 2026-04-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = 'p6k7l8m9n0o1'
down_revision = 'o5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cmt_order_accessories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('total_qty', sa.Numeric(10, 2), nullable=False),
        sa.Column('unit_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('from_stock', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('purchased_qty', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('purchase_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_cmt_order_accessories_order_id', 'cmt_order_accessories', ['order_id'])


def downgrade() -> None:
    op.drop_index('ix_cmt_order_accessories_order_id', 'cmt_order_accessories')
    op.drop_table('cmt_order_accessories')
```

**Step 2: Run migration locally to verify**
```bash
cd backend && alembic upgrade head
```
Expected: `Running upgrade o5j6k7l8m9n0 -> p6k7l8m9n0o1`

**Step 3: Commit**
```bash
git add backend/alembic/versions/p6k7l8m9n0o1_add_order_accessories.py
git commit -m "feat: migration for cmt_order_accessories table"
```

---

### Task 3: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/accessories.py`

```python
# backend/app/schemas/accessories.py
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, computed_field


class AccessoryCreate(BaseModel):
    name: str
    total_qty: Decimal
    unit_price: Decimal
    from_stock: Decimal = Decimal("0")
    purchased_qty: Decimal = Decimal("0")
    purchase_cost: Optional[Decimal] = None


class AccessoryUpdate(BaseModel):
    name: Optional[str] = None
    total_qty: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    from_stock: Optional[Decimal] = None
    purchased_qty: Optional[Decimal] = None
    purchase_cost: Optional[Decimal] = None


class AccessoryOut(BaseModel):
    id: UUID
    order_id: UUID
    name: str
    total_qty: Decimal
    unit_price: Decimal
    from_stock: Decimal
    purchased_qty: Decimal
    purchase_cost: Optional[Decimal] = None

    @computed_field
    @property
    def total_charge(self) -> Decimal:
        return self.total_qty * self.unit_price

    @computed_field
    @property
    def total_purchase_spend(self) -> Optional[Decimal]:
        if self.purchase_cost is None:
            return None
        return self.purchased_qty * self.purchase_cost

    model_config = {"from_attributes": True}
```

**Commit:**
```bash
git add backend/app/schemas/accessories.py
git commit -m "feat: accessories Pydantic schemas"
```

---

### Task 4: API Endpoint

**Files:**
- Create: `backend/app/api/v1/endpoints/accessories.py`
- Modify: `backend/app/api/v1/router.py`

**Step 1: Create endpoint file**

```python
# backend/app/api/v1/endpoints/accessories.py
import uuid
from fastapi import APIRouter, HTTPException
from app.core.deps import CurrentUser, DbDep
from app.models.accessories import OrderAccessory
from app.models.orders import Order
from app.schemas.accessories import AccessoryCreate, AccessoryUpdate, AccessoryOut

router = APIRouter(prefix="/orders", tags=["accessories"])


def _to_out(a: OrderAccessory) -> AccessoryOut:
    return AccessoryOut.model_validate(a)


@router.get("/{order_id}/accessories", response_model=list[AccessoryOut])
def list_accessories(order_id: uuid.UUID, db: DbDep, _: CurrentUser):
    return [
        _to_out(a)
        for a in db.query(OrderAccessory)
        .filter(
            OrderAccessory.order_id == order_id,
            OrderAccessory.is_deleted.is_(False),
        )
        .order_by(OrderAccessory.created_at)
        .all()
    ]


@router.post("/{order_id}/accessories", response_model=AccessoryOut, status_code=201)
def create_accessory(order_id: uuid.UUID, body: AccessoryCreate, db: DbDep, _: CurrentUser):
    order = db.query(Order).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    a = OrderAccessory(order_id=order_id, **body.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _to_out(a)


@router.put("/{order_id}/accessories/{accessory_id}", response_model=AccessoryOut)
def update_accessory(
    order_id: uuid.UUID,
    accessory_id: uuid.UUID,
    body: AccessoryUpdate,
    db: DbDep,
    _: CurrentUser,
):
    a = db.query(OrderAccessory).filter(
        OrderAccessory.id == accessory_id,
        OrderAccessory.order_id == order_id,
        OrderAccessory.is_deleted.is_(False),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(a, field, value)
    db.commit()
    db.refresh(a)
    return _to_out(a)


@router.delete("/{order_id}/accessories/{accessory_id}", status_code=204)
def delete_accessory(
    order_id: uuid.UUID,
    accessory_id: uuid.UUID,
    db: DbDep,
    _: CurrentUser,
):
    a = db.query(OrderAccessory).filter(
        OrderAccessory.id == accessory_id,
        OrderAccessory.order_id == order_id,
        OrderAccessory.is_deleted.is_(False),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    a.is_deleted = True
    db.commit()
```

**Step 2: Register in router.py**

In `backend/app/api/v1/router.py`, add:
```python
from .endpoints.accessories import router as accessories_router
# ...
api_router.include_router(accessories_router)
```

**Step 3: Commit**
```bash
git add backend/app/api/v1/endpoints/accessories.py backend/app/api/v1/router.py
git commit -m "feat: accessories CRUD endpoints"
```

---

### Task 5: Frontend Types

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/tpes.tsx`  ← typo is intentional, keep it

Add to BOTH files:

```typescript
export interface OrderAccessory {
  id: string;
  order_id: string;
  name: string;
  total_qty: number;
  unit_price: number;
  from_stock: number;
  purchased_qty: number;
  purchase_cost: number | null;
  total_charge: number;
  total_purchase_spend: number | null;
}

export interface AccessoryCreate {
  name: string;
  total_qty: number;
  unit_price: number;
  from_stock: number;
  purchased_qty: number;
  purchase_cost?: number;
}
```

**Commit:**
```bash
git add frontend/src/hooks/types.ts frontend/src/hooks/tpes.tsx
git commit -m "feat: OrderAccessory types"
```

---

### Task 6: Frontend Services

**Files:**
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

Add to BOTH files (find the `productService` block and add after it):

```typescript
export const accessoryService = {
  list: (orderId: string) =>
    api.get<OrderAccessory[]>(`/orders/${orderId}/accessories`).then((r) => r.data),
  create: (orderId: string, data: AccessoryCreate) =>
    api.post<OrderAccessory>(`/orders/${orderId}/accessories`, data).then((r) => r.data),
  delete: (orderId: string, accessoryId: string) =>
    api.delete(`/orders/${orderId}/accessories/${accessoryId}`),
};
```

Also add `OrderAccessory, AccessoryCreate` to the imports from `@/hooks/types` in both files.

**Commit:**
```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: accessoryService"
```

---

### Task 7: Accessories Panel in Order Detail

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

**Step 1: Add state + load in the main page component**

Find the existing `const [materials, setMaterials]` state and add alongside it:
```typescript
const [accessories, setAccessories] = useState<OrderAccessory[]>([]);

const loadAccessories = useCallback(async () => {
  if (!id) return;
  try {
    const data = await accessoryService.list(id as string);
    setAccessories(data);
  } catch { /* silent */ }
}, [id]);
```

In the `useEffect` that loads order data, add `loadAccessories()`.

**Step 2: Add import**
```typescript
import { accessoryService } from "@/hooks/services";
import type { OrderAccessory, AccessoryCreate } from "@/hooks/types";
```

**Step 3: Add the AccessoriesPanel component** (add before the `export default` function)

```tsx
function AccessoriesPanel({
  orderId,
  accessories,
  onReload,
}: {
  orderId: string;
  accessories: OrderAccessory[];
  onReload: () => void;
}) {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccessoryCreate>({
    name: "", total_qty: 0, unit_price: 0, from_stock: 0, purchased_qty: 0,
  });

  const totalAccessoryCharge = accessories.reduce((s, a) => s + Number(a.total_charge), 0);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await accessoryService.create(orderId, form);
      setForm({ name: "", total_qty: 0, unit_price: 0, from_stock: 0, purchased_qty: 0 });
      setShowForm(false);
      onReload();
      showToast("Accessory added");
    } catch {
      showToast("Failed to add accessory", "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await accessoryService.delete(orderId, id);
      onReload();
      showToast("Removed");
    } catch { showToast("Failed to remove", "error"); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Accessories</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {accessories.length > 0
              ? `${accessories.length} item${accessories.length > 1 ? "s" : ""} · PKR ${formatCurrency(totalAccessoryCharge)} billed to party`
              : "Zip, thread, fabric, etc. charged to party"}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add"}
        </Button>
      </div>

      {accessories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Item</th>
                <th className="px-4 py-2.5 text-right">Total Qty</th>
                <th className="px-4 py-2.5 text-right">Unit Price</th>
                <th className="px-4 py-2.5 text-right">Charge</th>
                <th className="px-4 py-2.5 text-right">From Stock</th>
                <th className="px-4 py-2.5 text-right">Purchased</th>
                <th className="px-4 py-2.5 text-right">Buy Cost/u</th>
                <th className="px-4 py-2.5 text-right">Spend</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {accessories.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{Number(a.total_qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">PKR {formatCurrency(a.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-700">PKR {formatCurrency(a.total_charge)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{Number(a.from_stock).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{Number(a.purchased_qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                    {a.purchase_cost != null ? `PKR ${formatCurrency(a.purchase_cost)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-orange-600">
                    {a.total_purchase_spend != null ? `PKR ${formatCurrency(a.total_purchase_spend)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-blue-50">
                <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total accessory charge to party</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-blue-700 tabular-nums">
                  PKR {formatCurrency(totalAccessoryCharge)}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">New Accessory</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[140px]">
              <FormField label="Item Name" required>
                <Input placeholder="e.g. Zip" value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="Total Qty" required>
                <Input type="number" min="0" step="0.01" className="w-24" value={form.total_qty || ""}
                  onChange={(e) => setForm((p) => ({ ...p, total_qty: parseFloat(e.target.value) || 0 }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="Unit Price (PKR)" required>
                <Input type="number" min="0" step="0.01" className="w-28" value={form.unit_price || ""}
                  onChange={(e) => setForm((p) => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} required />
              </FormField>
            </div>
            <div>
              <FormField label="From Stock">
                <Input type="number" min="0" step="0.01" className="w-24" value={form.from_stock || ""}
                  onChange={(e) => setForm((p) => ({ ...p, from_stock: parseFloat(e.target.value) || 0 }))} />
              </FormField>
            </div>
            <div>
              <FormField label="Purchased Qty">
                <Input type="number" min="0" step="0.01" className="w-24" value={form.purchased_qty || ""}
                  onChange={(e) => setForm((p) => ({ ...p, purchased_qty: parseFloat(e.target.value) || 0 }))} />
              </FormField>
            </div>
            <div>
              <FormField label="Buy Cost/unit">
                <Input type="number" min="0" step="0.01" className="w-28" value={form.purchase_cost ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, purchase_cost: parseFloat(e.target.value) || undefined }))} />
              </FormField>
            </div>
            <div className="pb-0.5">
              <Button type="submit" loading={saving} disabled={!form.name || !form.total_qty || !form.unit_price}>
                Add
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
```

**Step 4: Render the panel**

In the JSX, place `<AccessoriesPanel>` between the colour breakdown card and the material requirements panel:
```tsx
<AccessoriesPanel
  orderId={order.id}
  accessories={accessories}
  onReload={loadAccessories}
/>
```

**Step 5: Add `FormField` and `Input` to imports from `@/components/common`** if not already there.

**Commit:**
```bash
git add frontend/src/app/\(dashboard\)/orders/\[id\]/page.tsx
git commit -m "feat: accessories panel in order detail"
```

---

### Task 8: Bill/Invoice — Show Accessories

**Files:**
- Modify: `frontend/src/app/(dashboard)/bills/[id]/page.tsx`

**Step 1: Load accessories on the bill page**

The bill page already has `bill.order_id`. Add a state and fetch:
```typescript
const [accessories, setAccessories] = useState<OrderAccessory[]>([]);

useEffect(() => {
  if (bill?.order_id) {
    accessoryService.list(bill.order_id).then(setAccessories).catch(() => {});
  }
}, [bill?.order_id]);
```

Add import: `import { accessoryService } from "@/hooks/services";`
Add import: `import type { OrderAccessory } from "@/hooks/types";`

**Step 2: Update the invoice items table**

After the closing `</tbody>` of the items table, add an accessories section:
```tsx
{accessories.length > 0 && (
  <>
    <tbody>
      <tr>
        <td colSpan={7} className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-200">
          Accessories
        </td>
      </tr>
      {accessories.map((a, idx) => (
        <tr key={a.id} className="hover:bg-gray-50">
          <td className="px-3 py-2.5 text-gray-400">{(bill.order_items?.length ?? 0) + idx + 1}</td>
          <td className="px-3 py-2.5 text-gray-800">{a.name}</td>
          <td className="px-3 py-2.5 text-center text-gray-500">—</td>
          <td className="px-3 py-2.5 text-right text-gray-700">{Number(a.total_qty).toLocaleString()}</td>
          <td className="px-3 py-2.5 text-right text-gray-700">PKR {fmt(a.unit_price)}</td>
          <td className="px-3 py-2.5 text-right text-gray-400">—</td>
          <td className="px-3 py-2.5 text-right font-medium text-gray-900">PKR {fmt(a.total_charge)}</td>
        </tr>
      ))}
    </tbody>
  </>
)}
```

**Step 3: Update totals calculation**

Find where `subtotal` and `amountDue` are calculated and add accessories total:
```typescript
const accessoryTotal = accessories.reduce((s, a) => s + Number(a.total_charge), 0);
const grandSubtotal = subtotal + accessoryTotal;
```

Update the Subtotal row to show `grandSubtotal` if `accessoryTotal > 0`:
```tsx
{accessoryTotal > 0 && (
  <div className="flex justify-between text-sm text-gray-600">
    <span>Accessories</span>
    <span>PKR {fmt(accessoryTotal)}</span>
  </div>
)}
<div className="flex justify-between text-sm text-gray-600">
  <span>Subtotal</span>
  <span>PKR {fmt(grandSubtotal)}</span>
</div>
```

**Commit:**
```bash
git add frontend/src/app/\(dashboard\)/bills/\[id\]/page.tsx
git commit -m "feat: show accessories on bill/invoice"
```

---

### Task 9: Final Push + Deploy

```bash
git push origin master
cd frontend && vercel --prod
```

---

## Notes

- The party ledger auto-updates because it reads from `cmt_bills.amount_due`. However, `amount_due` is set at bill creation time — **the bill amount_due does not auto-update when accessories are added later**. When creating a bill after accessories are added, the user should set `amount_due` = service total + accessory total. A future improvement could auto-calculate this.
- Inventory deduction from `from_stock` is tracked informationally only for now — no automatic `cmt_inventory_transactions` entry is created. That can be added in a future iteration.
