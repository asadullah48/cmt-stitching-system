# BOM / Material Requirements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Product Templates with Bill of Materials (BOM), auto-inventory consumption on order status change, and a Material Requirements view per order.

**Architecture:** New `cmt_products` + `cmt_product_bom_items` tables store reusable product recipes. Orders gain a nullable `product_id` FK. When order status changes to `stitching_in_progress` or `packing_in_progress`, the service layer auto-consumes the matching BOM items from inventory via `InventoryTransaction` records. The order detail page gains a "Material Requirements" panel showing required vs in-stock per department.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), Next.js 15 + TailwindCSS v4 + TypeScript (frontend), PostgreSQL on Neon (cmt_ table prefix).

---

## Task 1: Backend Models — Product + BOM

**Files:**
- Create: `backend/app/models/products.py`
- Modify: `backend/app/models/orders.py` (add `product_id` FK + relationship)
- Modify: `backend/app/models/__init__.py` (if it exists, else check main.py imports)

**Step 1: Create `backend/app/models/products.py`**

```python
from sqlalchemy import Column, String, Numeric, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Product(BaseModel):
    __tablename__ = "cmt_products"

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Relationships
    bom_items = relationship("ProductBOMItem", back_populates="product",
                             cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="product")


class ProductBOMItem(BaseModel):
    __tablename__ = "cmt_product_bom_items"

    product_id = Column(UUID(as_uuid=True), ForeignKey("cmt_products.id"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("cmt_inventory_items.id"), nullable=False)
    # e.g. material_quantity=1, covers_quantity=150 means "1 roll covers 150 pieces"
    # e.g. material_quantity=1, covers_quantity=1  means "1 zip per piece"
    material_quantity = Column(Numeric(10, 4), nullable=False)
    covers_quantity = Column(Numeric(10, 4), nullable=False, default=1)
    department = Column(String(20), nullable=False)  # "stitching" | "packing"
    notes = Column(String(200), nullable=True)       # e.g. "1 with foam", "2 blue button"

    # Relationships
    product = relationship("Product", back_populates="bom_items")
    inventory_item = relationship("InventoryItem")
```

**Step 2: Add `product_id` to `backend/app/models/orders.py`**

Add after `loading_charges` column:
```python
product_id = Column(UUID(as_uuid=True), ForeignKey("cmt_products.id"), nullable=True)
```

Add to relationships:
```python
product = relationship("Product", back_populates="orders")
```

**Step 3: Ensure models are imported in the app**

Check `backend/app/core/database.py` or wherever `Base.metadata` is used — make sure `products.py` is imported so Alembic detects the tables. In `backend/app/main.py` or `backend/alembic/env.py`, add:
```python
from app.models import products  # noqa: F401
```
Check how other models are imported and follow the same pattern.

---

## Task 2: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/f6a7b8c9d0e1_add_products_bom.py`

**Step 1: Create migration file**

```python
"""add products and bom tables

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Products table
    op.create_table(
        'cmt_products',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # BOM items table
    op.create_table(
        'cmt_product_bom_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('product_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_products.id'), nullable=False),
        sa.Column('inventory_item_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_inventory_items.id'), nullable=False),
        sa.Column('material_quantity', sa.Numeric(10, 4), nullable=False),
        sa.Column('covers_quantity', sa.Numeric(10, 4), nullable=False, server_default='1'),
        sa.Column('department', sa.String(20), nullable=False),
        sa.Column('notes', sa.String(200), nullable=True),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # Add product_id to orders
    op.add_column('cmt_orders',
        sa.Column('product_id', UUID(as_uuid=True),
                  sa.ForeignKey('cmt_products.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_orders', 'product_id')
    op.drop_table('cmt_product_bom_items')
    op.drop_table('cmt_products')
```

**Step 2: Verify migration chain**

Run locally (if DB access available):
```bash
cd backend
uv run alembic history
```
Expected: `e5f6a7b8c9d0` is shown as current head.

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/products.py`

```python
from __future__ import annotations
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
import uuid


class BOMItemCreate(BaseModel):
    inventory_item_id: uuid.UUID
    material_quantity: Decimal
    covers_quantity: Decimal = Decimal("1")
    department: str  # "stitching" | "packing"
    notes: Optional[str] = None


class BOMItemOut(BaseModel):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    inventory_item_name: str       # joined from InventoryItem
    inventory_item_unit: str       # joined from InventoryItem
    material_quantity: Decimal
    covers_quantity: Decimal
    department: str
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    bom_items: List[BOMItemOut] = []

    model_config = {"from_attributes": True}


# Used by GET /orders/{id}/materials
class MaterialRequirement(BaseModel):
    inventory_item_id: uuid.UUID
    inventory_item_name: str
    unit: str
    material_quantity: Decimal   # per batch
    covers_quantity: Decimal     # pieces per batch
    required: Decimal            # total needed for this order
    in_stock: Decimal            # current inventory stock
    shortfall: Decimal           # max(0, required - in_stock)
    sufficient: bool
    department: str
    notes: Optional[str]


class OrderMaterialsOut(BaseModel):
    product_name: Optional[str]
    order_quantity: int
    stitching: List[MaterialRequirement]
    packing: List[MaterialRequirement]
    stitching_consumed: bool     # True if already auto-consumed
    packing_consumed: bool
```

Also update `backend/app/schemas/orders.py` — add to `OrderCreate`, `OrderUpdate`, `OrderOut`:
```python
product_id: Optional[uuid.UUID] = None
product_name: Optional[str] = None   # read-only, populated in _to_out()
```

---

## Task 4: Products API Endpoints

**Files:**
- Create: `backend/app/api/v1/endpoints/products.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from datetime import date

from app.core.database import get_db
from app.models.products import Product, ProductBOMItem
from app.models.inventory import InventoryItem
from app.schemas.products import (
    ProductCreate, ProductUpdate, ProductOut, BOMItemCreate, BOMItemOut
)

router = APIRouter(prefix="/products", tags=["products"])


def _bom_to_out(b: ProductBOMItem) -> BOMItemOut:
    return BOMItemOut(
        id=b.id,
        inventory_item_id=b.inventory_item_id,
        inventory_item_name=b.inventory_item.name,
        inventory_item_unit=b.inventory_item.unit,
        material_quantity=b.material_quantity,
        covers_quantity=b.covers_quantity,
        department=b.department,
        notes=b.notes,
    )


def _product_to_out(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id,
        name=p.name,
        description=p.description,
        bom_items=[_bom_to_out(b) for b in p.bom_items if not b.is_deleted],
    )


@router.get("", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    products = db.query(Product).filter(Product.is_deleted.is_(False)).all()
    return [_product_to_out(p) for p in products]


@router.post("", response_model=ProductOut, status_code=201)
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    p = Product(name=body.name, description=body.description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _product_to_out(p)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: uuid.UUID, body: ProductUpdate, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id,
                                  Product.is_deleted.is_(False)).first()
    if not p:
        raise HTTPException(404, "Product not found")
    if body.name is not None:
        p.name = body.name
    if body.description is not None:
        p.description = body.description
    db.commit()
    db.refresh(p)
    return _product_to_out(p)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: uuid.UUID, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id,
                                  Product.is_deleted.is_(False)).first()
    if not p:
        raise HTTPException(404, "Product not found")
    p.is_deleted = True
    db.commit()


@router.post("/{product_id}/bom", response_model=BOMItemOut, status_code=201)
def add_bom_item(product_id: uuid.UUID, body: BOMItemCreate, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id,
                                  Product.is_deleted.is_(False)).first()
    if not p:
        raise HTTPException(404, "Product not found")
    inv = db.query(InventoryItem).filter(InventoryItem.id == body.inventory_item_id,
                                          InventoryItem.is_deleted.is_(False)).first()
    if not inv:
        raise HTTPException(404, "Inventory item not found")
    bom = ProductBOMItem(
        product_id=product_id,
        inventory_item_id=body.inventory_item_id,
        material_quantity=body.material_quantity,
        covers_quantity=body.covers_quantity,
        department=body.department,
        notes=body.notes,
    )
    db.add(bom)
    db.commit()
    db.refresh(bom)
    return _bom_to_out(bom)


@router.delete("/bom/{bom_item_id}", status_code=204)
def delete_bom_item(bom_item_id: uuid.UUID, db: Session = Depends(get_db)):
    b = db.query(ProductBOMItem).filter(ProductBOMItem.id == bom_item_id,
                                         ProductBOMItem.is_deleted.is_(False)).first()
    if not b:
        raise HTTPException(404, "BOM item not found")
    b.is_deleted = True
    db.commit()
```

---

## Task 5: Material Requirements Endpoint + Auto-Consumption

**Files:**
- Modify: `backend/app/api/v1/endpoints/orders.py` — add `GET /orders/{id}/materials`
- Modify: `backend/app/services/order_service.py` — consume BOM on status change

**Step 1: Add material requirements endpoint to orders.py**

```python
from app.schemas.products import OrderMaterialsOut, MaterialRequirement
from app.models.products import Product, ProductBOMItem
from app.models.inventory import InventoryItem, InventoryTransaction
from decimal import Decimal
import math

@router.get("/{order_id}/materials", response_model=OrderMaterialsOut)
def get_order_materials(order_id: uuid.UUID, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id,
                                    Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.product_id:
        return OrderMaterialsOut(
            product_name=None, order_quantity=order.total_quantity,
            stitching=[], packing=[],
            stitching_consumed=False, packing_consumed=False,
        )

    product = db.query(Product).filter(Product.id == order.product_id).first()
    bom_items = db.query(ProductBOMItem).filter(
        ProductBOMItem.product_id == order.product_id,
        ProductBOMItem.is_deleted.is_(False)
    ).all()

    qty = Decimal(str(order.total_quantity))
    stitching_reqs = []
    packing_reqs = []

    for b in bom_items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == b.inventory_item_id).first()
        if not inv:
            continue
        # required = ceil(order_qty / covers_quantity) * material_quantity
        required = (qty / b.covers_quantity) * b.material_quantity
        in_stock = Decimal(str(inv.current_stock))
        shortfall = max(Decimal("0"), required - in_stock)
        req = MaterialRequirement(
            inventory_item_id=b.inventory_item_id,
            inventory_item_name=inv.name,
            unit=inv.unit,
            material_quantity=b.material_quantity,
            covers_quantity=b.covers_quantity,
            required=required.quantize(Decimal("0.01")),
            in_stock=in_stock,
            shortfall=shortfall.quantize(Decimal("0.01")),
            sufficient=shortfall == 0,
            department=b.department,
            notes=b.notes,
        )
        if b.department == "stitching":
            stitching_reqs.append(req)
        else:
            packing_reqs.append(req)

    # Check if already consumed (has consumption transactions for this order)
    consumed_depts = db.query(InventoryTransaction.notes).filter(
        InventoryTransaction.reference_id == order_id,
        InventoryTransaction.reference_type == "order_bom",
    ).all()
    consumed_notes = [r[0] or "" for r in consumed_depts]
    stitching_consumed = any("stitching" in n for n in consumed_notes)
    packing_consumed = any("packing" in n for n in consumed_notes)

    return OrderMaterialsOut(
        product_name=product.name if product else None,
        order_quantity=order.total_quantity,
        stitching=stitching_reqs,
        packing=packing_reqs,
        stitching_consumed=stitching_consumed,
        packing_consumed=packing_consumed,
    )
```

**Step 2: Auto-consume in `order_service.py` `update_status()`**

In the existing `update_status` method, add after the status is set but before `db.commit()`:

```python
from app.models.products import ProductBOMItem
from app.models.inventory import InventoryItem, InventoryTransaction
from decimal import Decimal
from datetime import date

def _consume_bom(db, order, department: str):
    """Deduct BOM materials from inventory for the given department."""
    if not order.product_id:
        return
    bom_items = db.query(ProductBOMItem).filter(
        ProductBOMItem.product_id == order.product_id,
        ProductBOMItem.department == department,
        ProductBOMItem.is_deleted.is_(False),
    ).all()
    qty = Decimal(str(order.total_quantity))
    for b in bom_items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == b.inventory_item_id).first()
        if not inv:
            continue
        consumed = (qty / b.covers_quantity) * b.material_quantity
        inv.current_stock = max(Decimal("0"), Decimal(str(inv.current_stock)) - consumed)
        tx = InventoryTransaction(
            item_id=b.inventory_item_id,
            transaction_type="consumption",
            quantity=-consumed,
            transaction_date=date.today(),
            reference_id=order.id,
            reference_type="order_bom",
            notes=f"{department} BOM consumption for order {order.order_number}",
        )
        db.add(tx)

# In update_status(), after setting order.status:
if new_status == "stitching_in_progress":
    _consume_bom(db, order, "stitching")
elif new_status == "packing_in_progress":
    _consume_bom(db, order, "packing")
```

---

## Task 6: Register Products Router + Update Orders Schema

**Files:**
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/schemas/orders.py`

**Step 1: Add to router.py**
```python
from .endpoints.products import router as products_router
api_router.include_router(products_router)
```

**Step 2: Add `product_id` + `product_name` to `OrderCreate`, `OrderUpdate`, `OrderOut` in schemas/orders.py**
```python
product_id: Optional[uuid.UUID] = None
# In OrderOut only:
product_name: Optional[str] = None
```

**Step 3: Update `_to_out()` in orders.py endpoint to include:**
```python
product_id=order.product_id,
product_name=order.product.name if order.product else None,
```

---

## Task 7: Frontend Types + Services

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

**Step 1: Add to types.ts**

```typescript
export interface ProductBOMItem {
  id: string;
  inventory_item_id: string;
  inventory_item_name: string;
  inventory_item_unit: string;
  material_quantity: number;
  covers_quantity: number;
  department: "stitching" | "packing";
  notes?: string | null;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  bom_items: ProductBOMItem[];
}

export interface MaterialRequirement {
  inventory_item_id: string;
  inventory_item_name: string;
  unit: string;
  material_quantity: number;
  covers_quantity: number;
  required: number;
  in_stock: number;
  shortfall: number;
  sufficient: boolean;
  department: string;
  notes?: string | null;
}

export interface OrderMaterials {
  product_name: string | null;
  order_quantity: number;
  stitching: MaterialRequirement[];
  packing: MaterialRequirement[];
  stitching_consumed: boolean;
  packing_consumed: boolean;
}
```

Also add to `Order` interface:
```typescript
product_id?: string | null;
product_name?: string | null;
```

And to `OrderCreate`:
```typescript
product_id?: string | null;
```

**Step 2: Add to both services.ts and services.tsx**

```typescript
export const productService = {
  getProducts: () =>
    api.get<Product[]>("/products").then((r) => r.data),

  createProduct: (data: { name: string; description?: string }) =>
    api.post<Product>("/products", data).then((r) => r.data),

  updateProduct: (id: string, data: { name?: string; description?: string }) =>
    api.put<Product>(`/products/${id}`, data).then((r) => r.data),

  deleteProduct: (id: string) =>
    api.delete(`/products/${id}`),

  addBOMItem: (productId: string, data: {
    inventory_item_id: string;
    material_quantity: number;
    covers_quantity: number;
    department: string;
    notes?: string;
  }) => api.post<ProductBOMItem>(`/products/${productId}/bom`, data).then((r) => r.data),

  deleteBOMItem: (bomItemId: string) =>
    api.delete(`/products/bom/${bomItemId}`),

  getOrderMaterials: (orderId: string) =>
    api.get<OrderMaterials>(`/orders/${orderId}/materials`).then((r) => r.data),
};
```

---

## Task 8: Products Page (Frontend)

**Files:**
- Create: `frontend/src/app/(dashboard)/products/page.tsx`

This page has two sections:

**Left panel — Product list** (same pattern as Quality/Dispatch left panels):
- List of products with name + count of BOM items (stitching / packing)
- "+ New Product" button opens a sheet form
- Clicking a product shows its BOM on the right

**Right panel — BOM Builder** for selected product:
- Two tabs: **Stitching** | **Packing**
- Table rows showing: Material name | Qty | Covers | Notes | Delete button
- "+ Add Material" row at bottom:
  - Dropdown: pick inventory item
  - Input: material quantity
  - Input: covers quantity (default 1)
  - Input: notes (optional)
  - Add button

```tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { productService, inventoryService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { Button, FormField, Input, Select, Sheet, ConfirmDialog, Spinner } from "@/components/common";
import type { Product, ProductBOMItem, InventoryItem } from "@/hooks/types";

// Full implementation — see detailed code in Task 8 implementation step
```

Key UX details:
- Each BOM line shows: `[item name] — [qty] [unit] covers [covers] pcs — [notes?] [🗑 delete]`
- Adding a BOM line does an immediate POST and refreshes
- Deleting does immediate DELETE with confirm

---

## Task 9: Material Requirements Panel on Order Detail Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`

Add a `MaterialRequirementsPanel` component that:

1. Fetches `productService.getOrderMaterials(orderId)` on mount
2. Shows a two-tab view: **Stitching Materials** | **Packing Materials**
3. Each tab shows a table:

| Material | Required | In Stock | Shortfall | Status |
|---|---|---|---|---|
| Parachute Navy | 1.00 rolls | 3.50 rolls | — | ✓ Sufficient |
| 17" Zip | 150 each | 80 each | 70 each | ⚠ Short |

4. Summary banner: "All materials sufficient" (green) or "X items short — check inventory" (orange)
5. If `stitching_consumed: true` → show "Auto-consumed when stitching started" badge
6. If no product set → show "No product assigned. Edit the order to assign a product." prompt

**Placement:** Insert between "Rates" card and "Income Summary" card in the order detail page.

---

## Task 10: Update Order Form + Sidebar

**Files:**
- Modify: `frontend/src/components/orders.tsx` — add Product dropdown
- Modify: `frontend/src/app/(dashboard)/layout.tsx` — add Products nav item

**Step 1: Add to OrderForm in orders.tsx**

Above the `goods_description` field, add:
```tsx
<FormField label="Product Template (optional)">
  <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
    <option value="">— No template —</option>
    {products.map((p) => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </Select>
</FormField>
```

Fetch products in OrderForm: `productService.getProducts()` on mount.
Pass `product_id: productId || undefined` in create/update payload.

**Step 2: Add Products nav item to layout.tsx**

Add icon function:
```tsx
function IconList() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}
```

Add to NAV_ITEMS after "Orders":
```tsx
{ label: "Products", href: "/products", icon: <IconList /> },
```

---

## Task 11: Build Verification + Commit

**Step 1: TypeScript check**
```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

**Step 2: Production build**
```bash
npx next build
```
Expected: all pages compile, 0 ESLint errors.

**Step 3: Python syntax check**
```bash
cd backend
python -m py_compile app/models/products.py app/schemas/products.py app/api/v1/endpoints/products.py app/services/order_service.py
echo OK
```

**Step 4: Commit**
```bash
git add backend/ frontend/src/
git commit -m "feat: BOM product templates + material requirements + auto-inventory consumption"
```

**Step 5: Deploy frontend**
```bash
cd frontend && vercel deploy --prod
```
Backend auto-deploys from git push and runs migrations on startup.

---

## Notes for Implementation

- `covers_quantity` default is `1` (simplest case: 1 item per piece, like zips)
- All BOM consumption is idempotent-safe: if status changes back and forward, stock can go negative but the transaction log will show it. For this scale (1-5 users) this is acceptable.
- The `InventoryTransaction.reference_type = "order_bom"` distinguishes auto-consumption from manual stock adjustments.
- Orders without a `product_id` are fully unaffected — all new code paths check `if not order.product_id: return` early.
- `services.ts` AND `services.tsx` BOTH need the `productService` added (duplicate file pattern in this codebase).
