"""
Products API endpoints.

Provides CRUD for Products and their Bill of Materials (BOM) items.
Route ordering note: DELETE /bom/{bom_item_id} is declared before the
parameterised DELETE /{product_id} so that FastAPI never mistakes the
literal segment "bom" for a product UUID.
"""

import uuid

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DbDep
from app.models.inventory import InventoryItem
from app.models.products import Product, ProductBOMItem
from app.schemas.products import (
    BOMItemCreate,
    BOMItemOut,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)

router = APIRouter(prefix="/products", tags=["products"])


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _bom_to_out(b: ProductBOMItem) -> BOMItemOut:
    """Convert a ProductBOMItem ORM instance to its Pydantic output schema."""
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
    """Convert a Product ORM instance to its Pydantic output schema."""
    return ProductOut(
        id=p.id,
        name=p.name,
        description=p.description,
        bom_items=[_bom_to_out(b) for b in p.bom_items if not b.is_deleted],
    )


# ─── Products ─────────────────────────────────────────────────────────────────


@router.get("", response_model=list[ProductOut])
def list_products(db: DbDep, _: CurrentUser):
    """Return all non-deleted products with their active BOM items."""
    products = (
        db.query(Product)
        .filter(Product.is_deleted.is_(False))
        .order_by(Product.name)
        .all()
    )
    return [_product_to_out(p) for p in products]


@router.post("", response_model=ProductOut, status_code=201)
def create_product(body: ProductCreate, db: DbDep, _: CurrentUser):
    """Create a new product (no BOM items yet)."""
    p = Product(name=body.name, description=body.description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _product_to_out(p)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    db: DbDep,
    _: CurrentUser,
):
    """Update a product's name and/or description."""
    p = db.query(Product).filter(
        Product.id == product_id, Product.is_deleted.is_(False)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.name is not None:
        p.name = body.name
    if body.description is not None:
        p.description = body.description
    db.commit()
    db.refresh(p)
    return _product_to_out(p)


# NOTE: /bom/{bom_item_id} is declared BEFORE /{product_id} so that the
# literal path segment "bom" is never captured by the UUID path parameter.
@router.delete("/bom/{bom_item_id}", status_code=204)
def delete_bom_item(bom_item_id: uuid.UUID, db: DbDep, _: CurrentUser):
    """Soft-delete a single BOM line item."""
    b = db.query(ProductBOMItem).filter(
        ProductBOMItem.id == bom_item_id,
        ProductBOMItem.is_deleted.is_(False),
    ).first()
    if not b:
        raise HTTPException(status_code=404, detail="BOM item not found")
    b.is_deleted = True
    db.commit()


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: uuid.UUID, db: DbDep, _: CurrentUser):
    """Soft-delete a product (BOM items are cascade-marked by SQLAlchemy)."""
    p = db.query(Product).filter(
        Product.id == product_id, Product.is_deleted.is_(False)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    p.is_deleted = True
    db.commit()


# ─── BOM Items ────────────────────────────────────────────────────────────────


@router.post("/{product_id}/bom", response_model=BOMItemOut, status_code=201)
def add_bom_item(
    product_id: uuid.UUID,
    body: BOMItemCreate,
    db: DbDep,
    _: CurrentUser,
):
    """Add a new BOM line item to the given product."""
    p = db.query(Product).filter(
        Product.id == product_id, Product.is_deleted.is_(False)
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")

    inv = db.query(InventoryItem).filter(
        InventoryItem.id == body.inventory_item_id,
        InventoryItem.is_deleted.is_(False),
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found")

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
