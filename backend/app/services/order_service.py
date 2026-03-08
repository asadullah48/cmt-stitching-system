from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.orders import Order, OrderItem
from app.schemas.orders import OrderCreate, OrderUpdate
from app.services.audit_service import AuditService


def _consume_bom(db: Session, order: Order, department: str) -> None:
    """Deduct BOM materials from inventory when an order starts a production phase.

    Creates an InventoryTransaction record for each consumed BOM item so that
    the consumption can be detected later (prevents double-counting in the UI).
    Stock floors at zero — it will not go negative.
    """
    from app.models.products import ProductBOMItem
    from app.models.inventory import InventoryItem, InventoryTransaction
    from decimal import Decimal
    from datetime import date

    if not order.product_id:
        return

    bom_items = db.query(ProductBOMItem).filter(
        ProductBOMItem.product_id == order.product_id,
        ProductBOMItem.department == department,
        ProductBOMItem.is_deleted.is_(False),
    ).all()

    qty = Decimal(str(order.total_quantity))
    for b in bom_items:
        inv = db.query(InventoryItem).filter(
            InventoryItem.id == b.inventory_item_id
        ).first()
        if not inv:
            continue

        consumed = (qty / Decimal(str(b.covers_quantity))) * Decimal(str(b.material_quantity))
        inv.current_stock = max(
            Decimal("0"),
            Decimal(str(inv.current_stock)) - consumed,
        )

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


class OrderService:
    @staticmethod
    def _generate_order_number(db: Session) -> str:
        prefix = f"ORD-{datetime.now().strftime('%Y%m')}-"
        last = (
            db.query(Order)
            .filter(Order.order_number.like(f"{prefix}%"))
            .order_by(Order.order_number.desc())
            .first()
        )
        seq = int(last.order_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @staticmethod
    def create(db: Session, data: OrderCreate, user_id: UUID) -> Order:
        order_number = OrderService._generate_order_number(db)
        order = Order(
            order_number=order_number,
            party_id=data.party_id,
            party_reference=data.party_reference,
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
        db.add(order)
        db.flush()  # get order.id before adding items

        for item_data in data.items:
            db.add(OrderItem(order_id=order.id, size=item_data.size, quantity=item_data.quantity))

        AuditService.log_create(db, "cmt_orders", order.id, {"order_number": order_number}, user_id)
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def get_all(
        db: Session,
        page: int = 1,
        size: int = 20,
        status_filter: Optional[str] = None,
        party_id: Optional[UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        search: Optional[str] = None,
    ) -> tuple[list[Order], int]:
        from sqlalchemy import or_
        from app.models.parties import Party
        q = (
            db.query(Order)
            .options(joinedload(Order.items), joinedload(Order.party), joinedload(Order.product))
            .filter(Order.is_deleted.is_(False))
        )
        if status_filter:
            q = q.filter(Order.status == status_filter)
        if party_id:
            q = q.filter(Order.party_id == party_id)
        if date_from:
            q = q.filter(Order.entry_date >= date_from)
        if date_to:
            q = q.filter(Order.entry_date <= date_to)
        if search:
            term = f"%{search}%"
            q = q.outerjoin(Party, Order.party_id == Party.id).filter(
                or_(
                    Order.order_number.ilike(term),
                    Order.goods_description.ilike(term),
                    Order.party_reference.ilike(term),
                    Party.name.ilike(term),
                )
            )

        total = q.count()
        orders = q.order_by(Order.created_at.desc()).offset((page - 1) * size).limit(size).all()
        return orders, total

    @staticmethod
    def get_by_id(db: Session, order_id: UUID) -> Order:
        order = (
            db.query(Order)
            .options(joinedload(Order.items), joinedload(Order.party), joinedload(Order.product))
            .filter(Order.id == order_id, Order.is_deleted.is_(False))
            .first()
        )
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        return order

    @staticmethod
    def update(db: Session, order_id: UUID, data: OrderUpdate, user_id: UUID) -> Order:
        order = OrderService.get_by_id(db, order_id)
        changes = data.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(order, field, value)
        AuditService.log_update(db, "cmt_orders", order.id, {}, changes, user_id)
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def update_status(db: Session, order_id: UUID, new_status: str, user_id: UUID) -> Order:
        order = OrderService.get_by_id(db, order_id)
        old_status = order.status
        order.status = new_status
        AuditService.log_update(db, "cmt_orders", order.id, {"status": old_status}, {"status": new_status}, user_id)
        # Auto-consume BOM materials when production begins for each department
        if new_status == "stitching_in_progress":
            _consume_bom(db, order, "stitching")
        elif new_status == "packing_in_progress":
            _consume_bom(db, order, "packing")
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def soft_delete(db: Session, order_id: UUID, user_id: UUID) -> None:
        order = OrderService.get_by_id(db, order_id)
        order.is_deleted = True
        order.deleted_at = datetime.utcnow()
        AuditService.log_delete(db, "cmt_orders", order.id, user_id)
        db.commit()
