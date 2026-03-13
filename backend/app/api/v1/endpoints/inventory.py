from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DbDep
from app.models.inventory import InventoryCategory, InventoryItem, InventoryTransaction
from app.schemas.inventory import (
    CategoryCreate, CategoryOut,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemOut,
    InventoryItemListResponse, StockAdjustment,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ─── Categories ───────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DbDep, _: CurrentUser):
    return db.query(InventoryCategory).filter(
        InventoryCategory.is_deleted.is_(False)
    ).order_by(InventoryCategory.name).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: DbDep, _: CurrentUser):
    cat = InventoryCategory(name=data.name, category_type=data.category_type)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


# ─── Items ────────────────────────────────────────────────────────────────────

@router.get("/items", response_model=InventoryItemListResponse)
def list_items(
    db: DbDep,
    _: CurrentUser,
    page: int = 1,
    size: int = 50,
    category_type: str | None = None,
    search: str | None = None,
):
    q = db.query(InventoryItem).filter(InventoryItem.is_deleted.is_(False))

    if category_type or search:
        q = q.outerjoin(InventoryCategory, InventoryItem.category_id == InventoryCategory.id)
        if category_type:
            q = q.filter(InventoryCategory.category_type == category_type)
        if search:
            q = q.filter(InventoryItem.name.ilike(f"%{search}%"))

    total = q.count()
    items = q.order_by(InventoryItem.name).offset((page - 1) * size).limit(size).all()

    result = []
    for item in items:
        cat = db.query(InventoryCategory).filter(
            InventoryCategory.id == item.category_id
        ).first() if item.category_id else None
        result.append(InventoryItemOut(
            id=item.id,
            category_id=item.category_id,
            category_name=cat.name if cat else None,
            category_type=cat.category_type if cat else None,
            name=item.name,
            sku=item.sku,
            unit=item.unit,
            current_stock=item.current_stock or 0,
            minimum_stock=item.minimum_stock or 0,
            cost_per_unit=item.cost_per_unit,
            location=item.location,
            condition=item.condition or "good",
        ))

    return InventoryItemListResponse(data=result, total=total, page=page, size=size)


@router.get("/items/{item_id}", response_model=InventoryItemOut)
def get_item(item_id: UUID, db: DbDep, _: CurrentUser):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id, InventoryItem.is_deleted.is_(False)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    cat = db.query(InventoryCategory).filter(
        InventoryCategory.id == item.category_id
    ).first() if item.category_id else None
    return InventoryItemOut(
        id=item.id,
        category_id=item.category_id,
        category_name=cat.name if cat else None,
        category_type=cat.category_type if cat else None,
        name=item.name,
        sku=item.sku,
        unit=item.unit,
        current_stock=item.current_stock or 0,
        minimum_stock=item.minimum_stock or 0,
        cost_per_unit=item.cost_per_unit,
        location=item.location,
        condition=item.condition or "good",
    )


@router.post("/items", response_model=InventoryItemOut, status_code=201)
def create_item(data: InventoryItemCreate, db: DbDep, _: CurrentUser):
    item = InventoryItem(
        category_id=data.category_id,
        name=data.name,
        sku=data.sku,
        unit=data.unit,
        current_stock=data.current_stock,
        minimum_stock=data.minimum_stock,
        cost_per_unit=data.cost_per_unit,
        location=data.location,
        condition=data.condition or "good",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    cat = db.query(InventoryCategory).filter(
        InventoryCategory.id == item.category_id
    ).first() if item.category_id else None
    return InventoryItemOut(
        id=item.id,
        category_id=item.category_id,
        category_name=cat.name if cat else None,
        category_type=cat.category_type if cat else None,
        name=item.name,
        sku=item.sku,
        unit=item.unit,
        current_stock=item.current_stock or 0,
        minimum_stock=item.minimum_stock or 0,
        cost_per_unit=item.cost_per_unit,
        location=item.location,
        condition=item.condition or "good",
    )


@router.put("/items/{item_id}", response_model=InventoryItemOut)
def update_item(item_id: UUID, data: InventoryItemUpdate, db: DbDep, _: CurrentUser):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id, InventoryItem.is_deleted.is_(False)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)

    cat = db.query(InventoryCategory).filter(
        InventoryCategory.id == item.category_id
    ).first() if item.category_id else None
    return InventoryItemOut(
        id=item.id,
        category_id=item.category_id,
        category_name=cat.name if cat else None,
        category_type=cat.category_type if cat else None,
        name=item.name,
        sku=item.sku,
        unit=item.unit,
        current_stock=item.current_stock or 0,
        minimum_stock=item.minimum_stock or 0,
        cost_per_unit=item.cost_per_unit,
        location=item.location,
        condition=item.condition or "good",
    )


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: UUID, db: DbDep, _: CurrentUser):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id, InventoryItem.is_deleted.is_(False)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_deleted = True
    db.commit()


@router.patch("/items/{item_id}/adjust", response_model=InventoryItemOut)
def adjust_stock(item_id: UUID, data: StockAdjustment, db: DbDep, current_user: CurrentUser):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id, InventoryItem.is_deleted.is_(False)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    new_stock = (item.current_stock or 0) + data.quantity
    if new_stock < 0:
        raise HTTPException(status_code=400, detail="Stock cannot go below zero")

    item.current_stock = new_stock

    # Determine transaction type from direction
    tx_type = "purchase" if data.quantity > 0 else "consumption"

    tx = InventoryTransaction(
        item_id=item.id,
        transaction_type=tx_type,
        quantity=abs(data.quantity),
        transaction_date=data.transaction_date or date.today(),
        order_number=data.order_number,
        bill_number=data.bill_number,
        party_reference=data.party_reference,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(item)

    cat = db.query(InventoryCategory).filter(
        InventoryCategory.id == item.category_id
    ).first() if item.category_id else None
    return InventoryItemOut(
        id=item.id,
        category_id=item.category_id,
        category_name=cat.name if cat else None,
        category_type=cat.category_type if cat else None,
        name=item.name,
        sku=item.sku,
        unit=item.unit,
        current_stock=item.current_stock or 0,
        minimum_stock=item.minimum_stock or 0,
        cost_per_unit=item.cost_per_unit,
        location=item.location,
        condition=item.condition or "good",
    )
