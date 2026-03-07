from uuid import UUID
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbDep
from app.models.orders import Order

router = APIRouter(prefix="/dispatch", tags=["dispatch"])

CARRIERS = ["DHL", "FedEx", "UPS", "SF Express", "TCS", "Leopards", "Other"]


class DispatchUpdate(BaseModel):
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[float] = None


class DispatchOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[float] = None
    party_name: Optional[str] = None
    goods_description: str
    total_quantity: int

    model_config = {"from_attributes": True}


def _to_dispatch_out(o: Order) -> DispatchOut:
    return DispatchOut(
        id=o.id,
        order_number=o.order_number,
        status=o.status,
        carrier=o.carrier,
        tracking_number=o.tracking_number,
        dispatch_date=o.dispatch_date,
        carton_count=o.carton_count,
        total_weight=float(o.total_weight) if o.total_weight else None,
        party_name=o.party.name if o.party else None,
        goods_description=o.goods_description,
        total_quantity=o.total_quantity,
    )


@router.get("/carriers")
def list_carriers(_: CurrentUser):
    return CARRIERS


@router.get("/ready", response_model=List[DispatchOut])
def orders_ready_for_dispatch(db: DbDep, _: CurrentUser):
    orders = (
        db.query(Order)
        .filter(
            Order.status.in_(["packing_complete", "dispatched"]),
            Order.is_deleted.is_(False),
        )
        .order_by(Order.updated_at.desc())
        .all()
    )
    return [_to_dispatch_out(o) for o in orders]


@router.patch("/{order_id}", response_model=DispatchOut)
def update_dispatch(order_id: UUID, data: DispatchUpdate, db: DbDep, _: CurrentUser):
    order = db.query(Order).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    if order.carrier and not order.tracking_number:
        order.tracking_number = f"CMT-{str(order.id)[:8].upper()}"
    db.commit()
    db.refresh(order)
    return _to_dispatch_out(order)
