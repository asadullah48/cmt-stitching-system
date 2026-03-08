from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID
import uuid

from fastapi import APIRouter, HTTPException, Query, status as http_status

from app.core.deps import CurrentUser, DbDep
from app.models.inventory import InventoryItem, InventoryTransaction
from app.models.orders import Order
from app.models.products import Product, ProductBOMItem
from app.schemas.orders import (
    OrderCreate, OrderUpdate, OrderStatusUpdate,
    OrderOut, OrderListResponse,
)
from app.schemas.products import OrderMaterialsOut, MaterialRequirement
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
        product_id=order.product_id,
        product_name=order.product.name if order.product else None,
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


@router.get("/{order_id}/materials", response_model=OrderMaterialsOut)
def get_order_materials(order_id: uuid.UUID, db: DbDep):
    """Return per-department BOM material requirements for an order.

    Computes required vs in-stock quantities for each BOM line item linked
    to the order's product. Also flags whether consumption has already been
    recorded (prevents double-counting in the UI).
    """
    order = db.query(Order).filter(
        Order.id == order_id, Order.is_deleted.is_(False)
    ).first()
    if not order:
        raise HTTPException(404, "Order not found")

    # Orders without a product template have no BOM requirements
    if not order.product_id:
        return OrderMaterialsOut(
            product_name=None,
            order_quantity=order.total_quantity,
            stitching=[],
            packing=[],
            stitching_consumed=False,
            packing_consumed=False,
        )

    product = db.query(Product).filter(
        Product.id == order.product_id, Product.is_deleted.is_(False)
    ).first()

    bom_items = db.query(ProductBOMItem).filter(
        ProductBOMItem.product_id == order.product_id,
        ProductBOMItem.is_deleted.is_(False),
    ).all()

    qty = Decimal(str(order.total_quantity))
    stitching_reqs: list[MaterialRequirement] = []
    packing_reqs: list[MaterialRequirement] = []

    for b in bom_items:
        inv = db.query(InventoryItem).filter(
            InventoryItem.id == b.inventory_item_id,
            InventoryItem.is_deleted.is_(False),
        ).first()
        if not inv:
            continue

        # required = (order_qty / covers_quantity) * material_quantity
        required = (qty / Decimal(str(b.covers_quantity))) * Decimal(str(b.material_quantity))
        in_stock = Decimal(str(inv.current_stock))
        shortfall = max(Decimal("0"), required - in_stock)

        req = MaterialRequirement(
            inventory_item_id=b.inventory_item_id,
            inventory_item_name=inv.name,
            unit=inv.unit,
            material_quantity=Decimal(str(b.material_quantity)),
            covers_quantity=Decimal(str(b.covers_quantity)),
            required=required.quantize(Decimal("0.0001")),
            in_stock=in_stock,
            shortfall=shortfall.quantize(Decimal("0.0001")),
            sufficient=shortfall == 0,
            department=b.department,
            notes=b.notes,
        )

        if b.department == "stitching":
            stitching_reqs.append(req)
        else:
            packing_reqs.append(req)

    # Detect whether BOM has already been auto-consumed for this order
    consumed_records = db.query(InventoryTransaction).filter(
        InventoryTransaction.reference_id == order_id,
        InventoryTransaction.reference_type == "order_bom",
    ).all()
    consumed_notes = [r.notes or "" for r in consumed_records]
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
