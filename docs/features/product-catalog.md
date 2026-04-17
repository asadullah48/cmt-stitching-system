# Product Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full Product Catalog (bedrail, castel, tent house, etc.) with image, colors, qty — and wire it into Order creation so orders reference catalog products with color selection.

**Architecture:** New `cmt_products` table stores product name, image URL, category, available colors, and base rate. Orders get two new nullable columns: `product_id` FK and `color`. Frontend gets a `/products` catalog page (grid of cards) and the order form gains a product picker + color swatches. Images are stored as URLs (user pastes any public image URL); category SVG placeholders shown as fallback.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend) · Next.js 15 + TailwindCSS v4 + TypeScript (frontend) · PostgreSQL on Neon (shared DB, all tables prefixed `cmt_`) · uv for Python deps · Vercel CLI for deploy

---

## Task 1: Backend — Product Model

**Files:**
- Create: `backend/app/models/products.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model**

```python
# backend/app/models/products.py
from sqlalchemy import Column, String, Text, Numeric, Boolean
from .base import BaseModel

class Product(BaseModel):
    __tablename__ = "cmt_products"

    name            = Column(String(120), nullable=False)
    category        = Column(String(60), nullable=False)          # e.g. "Bed", "Tent", "Castle"
    description     = Column(Text, nullable=True)
    image_url       = Column(Text, nullable=True)                  # publicly accessible URL
    available_colors = Column(Text, nullable=True)                 # comma-separated e.g. "Red,Blue,Green"
    base_rate       = Column(Numeric(10, 2), nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
```

**Step 2: Register in `__init__.py`**

Open `backend/app/models/__init__.py` and add:
```python
from .products import Product
```
alongside the other model imports.

**Step 3: Commit**
```bash
git add backend/app/models/products.py backend/app/models/__init__.py
git commit -m "feat: add Product model (cmt_products)"
```

---

## Task 2: Backend — Alembic Migration

**Files:**
- Create: `backend/alembic/versions/d4e5f6a7b8c9_add_products_and_order_product.py`

**Step 1: Write migration (use ABSOLUTE path)**

```python
# backend/alembic/versions/d4e5f6a7b8c9_add_products_and_order_product.py
"""add products table and product/color to orders

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade():
    # ── Products table ──────────────────────────────────────────────────────
    op.create_table(
        "cmt_products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column("available_colors", sa.Text, nullable=True),
        sa.Column("base_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ── Add product_id + color to cmt_orders ────────────────────────────────
    op.add_column("cmt_orders", sa.Column("product_id", UUID(as_uuid=True),
        sa.ForeignKey("cmt_products.id", ondelete="SET NULL"), nullable=True))
    op.add_column("cmt_orders", sa.Column("color", sa.String(60), nullable=True))


def downgrade():
    op.drop_column("cmt_orders", "color")
    op.drop_column("cmt_orders", "product_id")
    op.drop_table("cmt_products")
```

**Step 2: Run migration locally to verify SQL is valid (optional)**
```bash
cd backend
uv run alembic upgrade head
```
Expected: migration runs without error. On Render it runs automatically at startup.

**Step 3: Commit**
```bash
git add backend/alembic/versions/d4e5f6a7b8c9_add_products_and_order_product.py
git commit -m "feat: migration - add cmt_products table + product_id/color to orders"
```

---

## Task 3: Backend — Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/products.py`
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/schemas/orders.py`

**Step 1: Create product schemas**

```python
# backend/app/schemas/products.py
from decimal import Decimal
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available_colors: Optional[str] = None   # comma-separated
    base_rate: Optional[Decimal] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    available_colors: Optional[str] = None
    base_rate: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: UUID
    name: str
    category: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    available_colors: Optional[str] = None
    base_rate: Optional[Decimal] = None
    is_active: bool

    model_config = {"from_attributes": True}

    @property
    def colors_list(self) -> List[str]:
        if not self.available_colors:
            return []
        return [c.strip() for c in self.available_colors.split(",") if c.strip()]


class ProductListResponse(BaseModel):
    data: list[ProductOut]
    total: int
    page: int
    size: int
```

**Step 2: Register in `backend/app/schemas/__init__.py`**
Add:
```python
from .products import ProductOut, ProductCreate, ProductUpdate, ProductListResponse
```

**Step 3: Update `backend/app/schemas/orders.py`**

Add to `OrderCreate`:
```python
product_id: Optional[UUID] = None
color: Optional[str] = None
```

Add to `OrderUpdate`:
```python
product_id: Optional[UUID] = None
color: Optional[str] = None
```

Add to `OrderOut`:
```python
product_id: Optional[UUID] = None
product_name: Optional[str] = None
product_image_url: Optional[str] = None
color: Optional[str] = None
```

**Step 4: Commit**
```bash
git add backend/app/schemas/products.py backend/app/schemas/__init__.py backend/app/schemas/orders.py
git commit -m "feat: product schemas + product_id/color fields on OrderOut"
```

---

## Task 4: Backend — Product Service + Router

**Files:**
- Create: `backend/app/services/product_service.py`
- Create: `backend/app/api/v1/endpoints/products.py`
- Modify: `backend/app/api/v1/router.py`

**Step 1: Product service**

```python
# backend/app/services/product_service.py
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.products import Product
from app.schemas.products import ProductCreate, ProductUpdate


class ProductService:
    @staticmethod
    def get_all(db: Session, page: int, size: int, category: str | None = None):
        q = db.query(Product).filter(Product.is_deleted.is_(False))
        if category:
            q = q.filter(Product.category == category)
        total = q.count()
        items = q.order_by(Product.name).offset((page - 1) * size).limit(size).all()
        return items, total

    @staticmethod
    def get_by_id(db: Session, product_id: UUID) -> Product:
        p = db.query(Product).filter(
            Product.id == product_id, Product.is_deleted.is_(False)
        ).first()
        if not p:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Product not found")
        return p

    @staticmethod
    def create(db: Session, data: ProductCreate) -> Product:
        p = Product(**data.model_dump())
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    @staticmethod
    def update(db: Session, product_id: UUID, data: ProductUpdate) -> Product:
        p = ProductService.get_by_id(db, product_id)
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(p, k, v)
        db.commit()
        db.refresh(p)
        return p

    @staticmethod
    def soft_delete(db: Session, product_id: UUID):
        p = ProductService.get_by_id(db, product_id)
        p.is_deleted = True
        db.commit()
```

**Step 2: Products router**

```python
# backend/app/api/v1/endpoints/products.py
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbDep
from app.schemas.products import ProductCreate, ProductUpdate, ProductOut, ProductListResponse
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=ProductListResponse)
def list_products(
    db: DbDep, _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
):
    items, total = ProductService.get_all(db, page, size, category)
    return ProductListResponse(data=items, total=total, page=page, size=size)


@router.post("/", response_model=ProductOut, status_code=201)
def create_product(data: ProductCreate, db: DbDep, _: CurrentUser):
    return ProductService.create(db, data)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: UUID, db: DbDep, _: CurrentUser):
    return ProductService.get_by_id(db, product_id)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: UUID, data: ProductUpdate, db: DbDep, _: CurrentUser):
    return ProductService.update(db, product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: UUID, db: DbDep, _: CurrentUser):
    ProductService.soft_delete(db, product_id)
```

**Step 3: Register router in `backend/app/api/v1/router.py`**

Add:
```python
from app.api.v1.endpoints.products import router as products_router
api_router.include_router(products_router)
```

**Step 4: Update `_to_out` in `backend/app/api/v1/endpoints/orders.py`**

Add these three lines to the `_to_out` function:
```python
product_id=order.product_id,
product_name=order.product.name if order.product else None,
product_image_url=order.product.image_url if order.product else None,
color=order.color,
```

Also add `product` relationship to `Order` model in `backend/app/models/orders.py`:
```python
product_id = Column(UUID(as_uuid=True), ForeignKey("cmt_products.id"), nullable=True)
color = Column(String(60), nullable=True)
product = relationship("Product", foreign_keys=[product_id])
```

**Step 5: Commit**
```bash
git add backend/app/services/product_service.py \
        backend/app/api/v1/endpoints/products.py \
        backend/app/api/v1/router.py \
        backend/app/api/v1/endpoints/orders.py \
        backend/app/models/orders.py
git commit -m "feat: products CRUD API + wire product into orders"
```

---

## Task 5: Backend — Seed Sample Products

**Files:**
- Modify: `backend/app/main.py`

**Step 1: Add seed_products function after `seed_admin`**

```python
def seed_products() -> None:
    """Seed default product catalog if no products exist."""
    try:
        from app.core.database import SessionLocal
        from app.models.products import Product
        db = SessionLocal()
        try:
            if db.query(Product).filter(Product.is_deleted.is_(False)).count() == 0:
                defaults = [
                    Product(name="Bedrail", category="Bed",
                        description="Standard single/double bedrail",
                        available_colors="White,Black,Brown,Beige,Grey",
                        image_url="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400"),
                    Product(name="Castle Tent", category="Tent",
                        description="Children's castle-style play tent",
                        available_colors="Pink,Blue,Red,Yellow,Purple",
                        image_url="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400"),
                    Product(name="Tent House", category="Tent",
                        description="Outdoor camping tent house",
                        available_colors="Green,Orange,Blue,Grey",
                        image_url="https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=400"),
                    Product(name="Bed Cover", category="Bed",
                        description="Full bed cover/bedspread",
                        available_colors="White,Cream,Blue,Red,Green,Yellow"),
                    Product(name="Pillow Case", category="Bed",
                        description="Standard pillow case set",
                        available_colors="White,Blue,Pink,Grey"),
                ]
                for p in defaults:
                    db.add(p)
                db.commit()
                logger.info("Default products seeded")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Product seed error (non-fatal): {e}")
```

**Step 2: Call it in lifespan**
```python
async def lifespan(app: FastAPI):
    run_migrations()
    seed_admin()
    seed_products()   # ← add this line
    yield
```

**Step 3: Commit**
```bash
git add backend/app/main.py
git commit -m "feat: seed default product catalog on startup"
```

---

## Task 6: Frontend — Types + Services

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/types.tsx` (if exists — keep both in sync)
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx` (keep both in sync)

**Step 1: Add Product types to `types.ts`**

```typescript
// ─── Products ────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string | null;
  image_url: string | null;
  available_colors: string | null;   // comma-separated
  base_rate: number | null;
  is_active: boolean;
}

export interface ProductCreate {
  name: string;
  category: string;
  description?: string;
  image_url?: string;
  available_colors?: string;
  base_rate?: number;
}

export type ProductUpdate = Partial<ProductCreate> & { is_active?: boolean };
```

Also update the `Order` interface to add:
```typescript
product_id?: string | null;
product_name?: string | null;
product_image_url?: string | null;
color?: string | null;
```

**Step 2: Add productsService to `services.ts`**

```typescript
export const productsService = {
  getProducts: async (page = 1, size = 50, category?: string) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (category) params.set("category", category);
    const { data } = await api.get<PaginatedResponse<Product>>(`/products/?${params}`);
    return data;
  },
  getProduct: async (id: string): Promise<Product> => {
    const { data } = await api.get<Product>(`/products/${id}`);
    return data;
  },
  createProduct: async (payload: ProductCreate): Promise<Product> => {
    const { data } = await api.post<Product>("/products/", payload);
    return data;
  },
  updateProduct: async (id: string, payload: ProductUpdate): Promise<Product> => {
    const { data } = await api.put<Product>(`/products/${id}`, payload);
    return data;
  },
  deleteProduct: async (id: string): Promise<void> => {
    await api.delete(`/products/${id}`);
  },
};
```

**Step 3: Mirror all changes to `services.tsx` and `types.tsx` if they exist**

```bash
# Check if .tsx duplicates exist
ls frontend/src/hooks/
```
If `services.tsx` and `types.tsx` exist, apply identical changes to them.

**Step 4: Commit**
```bash
git add frontend/src/hooks/types.ts frontend/src/hooks/types.tsx \
        frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: Product types and productsService"
```

---

## Task 7: Frontend — Products Catalog Page

**Files:**
- Create: `frontend/src/app/(dashboard)/products/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx` (add Products to nav)

**Step 1: Create the catalog page**

Design: dark navy header · filter by category · product grid (3 cols) · each card shows image, name, category badge, color swatches, base rate, edit/delete buttons · slide-in sheet for add/edit.

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { productsService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { PageHeader, Button, Sheet, Input, Select, FormField, Spinner } from "@/components/common";
import type { Product, ProductCreate, ProductUpdate } from "@/hooks/types";

// ─── Color swatch helper ──────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308",
  pink: "#ec4899", purple: "#a855f7", orange: "#f97316", white: "#f9fafb",
  black: "#111827", brown: "#92400e", beige: "#d4b896", grey: "#6b7280",
  gray: "#6b7280", cream: "#fef9c3",
};

function colorHex(name: string): string {
  return COLOR_MAP[name.toLowerCase()] ?? "#94a3b8";
}

// ─── Category SVG placeholder ─────────────────────────────────────────────────

function ProductPlaceholder({ category }: { category: string }) {
  const icons: Record<string, string> = {
    Bed: "M3 12h18M3 12V8a2 2 0 012-2h14a2 2 0 012 2v4M3 12v4a2 2 0 002 2h14a2 2 0 002-2v-4",
    Tent: "M3 21l9-18 9 18H3zM12 3v18",
    default: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  };
  const d = icons[category] ?? icons.default;
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={d} />
      </svg>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onEdit, onDelete }: {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  const colors = product.available_colors
    ? product.available_colors.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col group">
      {/* Image */}
      <div className="relative h-44 bg-gray-50 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <ProductPlaceholder category={product.category} />
        )}
        {/* Category badge */}
        <span className="absolute top-2 left-2 bg-[#1a2744]/80 text-white text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {product.category}
        </span>
        {!product.is_active && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            Inactive
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <h3 className="font-bold text-gray-900 text-base leading-tight">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
        )}

        {/* Colors */}
        {colors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">Colors:</span>
            {colors.slice(0, 8).map((c) => (
              <span
                key={c}
                title={c}
                className="w-4 h-4 rounded-full border border-gray-200 flex-shrink-0"
                style={{ backgroundColor: colorHex(c) }}
              />
            ))}
            {colors.length > 8 && (
              <span className="text-xs text-gray-400">+{colors.length - 8}</span>
            )}
          </div>
        )}

        {/* Rate */}
        {product.base_rate && (
          <p className="text-sm font-semibold text-blue-600">
            PKR {Number(product.base_rate).toLocaleString()} / unit
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => onEdit(product)}
          className="flex-1 text-xs py-1.5 bg-blue-50 text-blue-700 rounded-lg font-semibold hover:bg-blue-100 transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(product)}
          className="flex-1 text-xs py-1.5 bg-red-50 text-red-600 rounded-lg font-semibold hover:bg-red-100 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Product Form (inside Sheet) ──────────────────────────────────────────────

function ProductForm({ product, onSuccess, onCancel }: {
  product?: Product;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductCreate & { is_active?: boolean }>({
    name: product?.name ?? "",
    category: product?.category ?? "Bed",
    description: product?.description ?? "",
    image_url: product?.image_url ?? "",
    available_colors: product?.available_colors ?? "",
    base_rate: product?.base_rate ?? undefined,
    is_active: product?.is_active ?? true,
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        base_rate: form.base_rate ? Number(form.base_rate) : undefined,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        available_colors: form.available_colors || undefined,
      };
      if (product) {
        await productsService.updateProduct(product.id, payload);
        showToast("Product updated");
      } else {
        await productsService.createProduct(payload);
        showToast("Product added");
      }
      onSuccess();
    } catch {
      showToast("Failed to save product", "error");
    } finally {
      setSaving(false);
    }
  };

  const CATEGORIES = ["Bed", "Tent", "Castle", "Furniture", "Textile", "Other"];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Product Name *">
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. Bedrail, Castle Tent" />
      </FormField>
      <FormField label="Category *">
        <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </FormField>
      <FormField label="Description">
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Short description" />
      </FormField>
      <FormField label="Image URL">
        <Input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} placeholder="https://..." type="url" />
        {form.image_url && (
          <img src={form.image_url} alt="preview" className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
      </FormField>
      <FormField label="Available Colors" hint="Comma-separated: Red, Blue, Green">
        <Input value={form.available_colors} onChange={(e) => set("available_colors", e.target.value)} placeholder="Red,Blue,Green,White" />
      </FormField>
      <FormField label="Base Rate (PKR)">
        <Input type="number" step="0.01" min="0" value={form.base_rate ?? ""} onChange={(e) => set("base_rate", e.target.value)} placeholder="e.g. 150.00" />
      </FormField>
      {product && (
        <div className="flex items-center gap-3">
          <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="w-4 h-4 rounded" />
          <label htmlFor="is_active" className="text-sm text-gray-700">Active (visible in order form)</label>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={saving} className="flex-1 justify-center">
          {product ? "Update Product" : "Add Product"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>();
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await productsService.getProducts(1, 50, categoryFilter || undefined);
      setProducts(r.data);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (p: Product) => { setEditing(p); setSheetOpen(true); };
  const handleAdd = () => { setEditing(undefined); setSheetOpen(true); };
  const handleClose = () => { setSheetOpen(false); setEditing(undefined); };
  const handleSuccess = () => { handleClose(); load(); };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await productsService.deleteProduct(p.id);
      showToast("Product deleted");
      load();
    } catch {
      showToast("Failed to delete product", "error");
    }
  };

  const categories = [...new Set(products.map((p) => p.category))].sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1a2744] rounded-2xl px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Product Catalog</h1>
          <p className="text-xs text-blue-300 mt-0.5">{products.length} products · bedrails, tents, castles & more</p>
        </div>
        <Button onClick={handleAdd}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setCategoryFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!categoryFilter ? "bg-[#1a2744] text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c === categoryFilter ? "" : c)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${categoryFilter === c ? "bg-[#1a2744] text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="w-6 h-6" /></div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">No products yet</p>
          <p className="text-xs text-gray-400 mt-1">Add bedrails, tents, castles and other products</p>
          <Button onClick={handleAdd} className="mt-4">Add First Product</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onClose={handleClose} title={editing ? "Edit Product" : "Add Product"}>
        <ProductForm product={editing} onSuccess={handleSuccess} onCancel={handleClose} />
      </Sheet>
    </div>
  );
}
```

**Step 2: Add Products to sidebar nav in `layout.tsx`**

In `NAV_ITEMS`, add after Orders:
```typescript
{ label: "Products", href: "/products", icon: <IconBox /> },
```
(reuse the `IconBox` icon already added for Inventory)

**Step 3: Commit**
```bash
git add frontend/src/app/(dashboard)/products/page.tsx \
        frontend/src/app/(dashboard)/layout.tsx
git commit -m "feat: products catalog page with image, colors, category filter"
```

---

## Task 8: Frontend — Product Picker in Order Form

**Files:**
- Modify: `frontend/src/components/orders.tsx` (or wherever the OrderForm component lives — check with `grep -r "OrderForm" frontend/src`)

**Step 1: Locate the order form component**
```bash
grep -r "OrderForm\|goods_description" frontend/src/components/ --include="*.tsx" -l
```

**Step 2: Add product picker to the form**

Add at the top of the form (before goods_description):

```tsx
// Product picker state (add to form component state):
const [products, setProducts] = useState<Product[]>([]);
const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

// Load products on mount:
useEffect(() => {
  productsService.getProducts(1, 50).then((r) => setProducts(r.data));
}, []);

// Product picker JSX (add before goods_description field):
<FormField label="Product">
  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
    {products.filter((p) => p.is_active).map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => {
          setSelectedProduct(p);
          // auto-fill goods_description and stitch_rate from product
          setValue("product_id", p.id);
          if (!getValues("goods_description")) setValue("goods_description", p.name);
          if (p.base_rate) setValue("stitch_rate_party", p.base_rate);
        }}
        className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
          selectedProduct?.id === p.id
            ? "border-blue-500 bg-blue-50"
            : "border-gray-100 hover:border-gray-200"
        }`}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
          {p.image_url
            ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
          <p className="text-xs text-gray-400 truncate">{p.category}</p>
        </div>
      </button>
    ))}
  </div>
</FormField>

// Color picker (show only if product selected and has colors):
{selectedProduct?.available_colors && (
  <FormField label="Color">
    <div className="flex flex-wrap gap-2">
      {selectedProduct.available_colors.split(",").map((c) => c.trim()).filter(Boolean).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setValue("color", c)}
          title={c}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all ${
            watch("color") === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          <span className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: COLOR_MAP[c.toLowerCase()] ?? "#94a3b8" }} />
          {c}
        </button>
      ))}
    </div>
  </FormField>
)}
```

**Note:** The exact integration depends on whether the order form uses react-hook-form or controlled state. Read `frontend/src/components/orders.tsx` first and adapt accordingly. The key fields to add are `product_id` and `color`.

**Step 3: Show product thumbnail in order list**

In `frontend/src/app/(dashboard)/orders/page.tsx`, add a column:
```tsx
{
  key: "product_image_url", header: "",
  render: (row) => row.product_image_url ? (
    <img src={row.product_image_url} alt={row.product_name ?? ""} className="w-8 h-8 rounded-lg object-cover" />
  ) : null,
  className: "w-10",
}
```

**Step 4: Commit**
```bash
git add frontend/src/components/orders.tsx \
        frontend/src/app/(dashboard)/orders/page.tsx
git commit -m "feat: product picker + color selector in order form, thumbnail in order list"
```

---

## Task 9: Deploy

**Step 1: Push all commits**
```bash
git push origin master
```

**Step 2: Deploy frontend**
```bash
cd frontend && vercel deploy --prod
```

**Step 3: Backend auto-deploys on Render** — startup will run migration + seed products automatically.

**Step 4: Verify**
- Visit `/products` — catalog grid with bedrail, castle tent, tent house cards
- Create new order — product picker appears with images and color swatches
- Order list shows product thumbnail

---

## Migration Chain (updated)
```
4d1e3598580f → a1b2c3d4e5f6 → b2c3d4e5f6a7 → c3d4e5f6a7b8 → d4e5f6a7b8c9 (new head)
```
