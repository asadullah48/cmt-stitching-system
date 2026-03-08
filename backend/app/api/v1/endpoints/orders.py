from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Query, status as http_status

from app.core.deps import CurrentUser, DbDep
from app.schemas.orders import (
    OrderCreate, OrderUpdate, OrderStatusUpdate,
    OrderOut, OrderListResponse,
)
from app.services.order_service import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


def _to_out(order) -> OrderOut:
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        party_id=order.party_id,
        party_name=order.party.name if order.party else None,
        party_reference=order.party_reference,
        goods_description=order.goods_description,
        total_quantity=order.total_quantity,
        stitch_rate_party=order.stitch_rate_party,
        stitch_rate_labor=order.stitch_rate_labor,
        pack_rate_party=order.pack_rate_party,
        pack_rate_labor=order.pack_rate_labor,
        status=order.status,
        entry_date=order.entry_date,
        arrival_date=order.arrival_date,
        delivery_date=order.delivery_date,
        estimated_completion=order.estimated_completion,
        actual_completion=order.actual_completion,
        carrier=order.carrier,
        tracking_number=order.tracking_number,
        dispatch_date=order.dispatch_date,
        carton_count=order.carton_count,
        total_weight=order.total_weight,
        transport_expense=order.transport_expense,
        loading_expense=order.loading_expense,
        miscellaneous_expense=order.miscellaneous_expense,
        rent=order.rent,
        loading_charges=order.loading_charges,
        items=order.items,
    )


@router.get("/", response_model=OrderListResponse)
def list_orders(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    party_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
):
    orders, total = OrderService.get_all(db, page, size, status, party_id, date_from, date_to, search)
    return OrderListResponse(data=[_to_out(o) for o in orders], total=total, page=page, size=size)


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, db: DbDep, current_user: CurrentUser):
    order = OrderService.create(db, data, current_user.id)
    return _to_out(order)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: UUID, db: DbDep, _: CurrentUser):
    return _to_out(OrderService.get_by_id(db, order_id))


@router.put("/{order_id}", response_model=OrderOut)
def update_order(order_id: UUID, data: OrderUpdate, db: DbDep, current_user: CurrentUser):
    return _to_out(OrderService.update(db, order_id, data, current_user.id))


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(order_id: UUID, data: OrderStatusUpdate, db: DbDep, current_user: CurrentUser):
    return _to_out(OrderService.update_status(db, order_id, data.status.value, current_user.id))


@router.delete("/{order_id}", status_code=http_status.HTTP_204_NO_CONTENT)
def delete_order(order_id: UUID, db: DbDep, current_user: CurrentUser):
    OrderService.soft_delete(db, order_id, current_user.id)
