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
