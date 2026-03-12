from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.config import Config
from app.models.orders import Order, OrderItem
from app.models.financial import FinancialTransaction
from app.schemas.dashboard import DashboardSummary
from app.schemas.orders import OrderOut


class DashboardService:
    @staticmethod
    def get_summary(db: Session) -> DashboardSummary:
        # Order status counts
        status_counts = (
            db.query(Order.status, func.count(Order.id))
            .filter(Order.is_deleted.is_(False))
            .group_by(Order.status)
            .all()
        )
        counts = {s: c for s, c in status_counts}

        # Monthly revenue (income transactions this calendar month)
        today = date.today()
        monthly_revenue = (
            db.query(func.coalesce(func.sum(FinancialTransaction.amount), 0))
            .filter(
                FinancialTransaction.transaction_type == "income",
                FinancialTransaction.is_deleted.is_(False),
                func.extract("year", FinancialTransaction.transaction_date) == today.year,
                func.extract("month", FinancialTransaction.transaction_date) == today.month,
            )
            .scalar()
        ) or Decimal("0.00")

        # completed_today: orders dispatched today
        completed_today = (
            db.query(func.count(Order.id))
            .filter(
                Order.status == "dispatched",
                Order.is_deleted.is_(False),
                func.date(Order.updated_at) == today,
            )
            .scalar()
        ) or 0

        # active_orders: in stitching or packing
        active_orders = (
            counts.get("stitching_in_progress", 0) +
            counts.get("packing_in_progress", 0)
        )

        # on_hold_orders: pending
        on_hold_orders = counts.get("pending", 0)

        # stitching progress %
        stitch_q = (
            db.query(
                func.coalesce(func.sum(OrderItem.completed_quantity), 0),
                func.coalesce(func.sum(OrderItem.quantity), 1),
            )
            .join(Order, OrderItem.order_id == Order.id)
            .filter(
                Order.status.in_(["stitching_in_progress", "stitching_complete"]),
                Order.is_deleted.is_(False),
            )
            .first()
        )
        stitching_progress_pct = round(
            float(stitch_q[0]) / float(stitch_q[1]) * 100, 1
        ) if stitch_q and float(stitch_q[1]) > 0 else 0.0

        # packing progress %
        pack_q = (
            db.query(
                func.coalesce(func.sum(OrderItem.packed_quantity), 0),
                func.coalesce(func.sum(OrderItem.quantity), 1),
            )
            .join(Order, OrderItem.order_id == Order.id)
            .filter(
                Order.status.in_(["packing_in_progress", "packing_complete"]),
                Order.is_deleted.is_(False),
            )
            .first()
        )
        packing_progress_pct = round(
            float(pack_q[0]) / float(pack_q[1]) * 100, 1
        ) if pack_q and float(pack_q[1]) > 0 else 0.0

        # Monthly collected (payment transactions this calendar month)
        collected_month = (
            db.query(func.coalesce(func.sum(FinancialTransaction.amount), 0))
            .filter(
                FinancialTransaction.transaction_type == "payment",
                FinancialTransaction.is_deleted.is_(False),
                func.extract("year", FinancialTransaction.transaction_date) == today.year,
                func.extract("month", FinancialTransaction.transaction_date) == today.month,
            )
            .scalar()
        ) or Decimal("0.00")

        # Total outstanding (all unpaid/partial bills)
        outstanding_total = (
            db.query(func.coalesce(
                func.sum(Bill.amount_due - Bill.amount_paid), 0
            ))
            .filter(
                Bill.is_deleted.is_(False),
                Bill.payment_status.in_(["unpaid", "partial"]),
            )
            .scalar()
        ) or Decimal("0.00")

        # Orders created this month
        orders_this_month = (
            db.query(func.count(Order.id))
            .filter(
                Order.is_deleted.is_(False),
                func.extract("year", Order.entry_date) == today.year,
                func.extract("month", Order.entry_date) == today.month,
            )
            .scalar()
        ) or 0

        # Business config (business_name, owner_name)
        def _cfg(key: str, default: str) -> str:
            row = db.query(Config).filter(Config.key == key).first()
            return row.value if row else default

        business_name = _cfg("business_name", "CMT Stitching & Packing")
        owner_name = _cfg("owner_name", "")

        # Recent orders (last 10)
        recent_orders_raw = (
            db.query(Order)
            .options(joinedload(Order.items), joinedload(Order.party))
            .filter(Order.is_deleted.is_(False))
            .order_by(Order.created_at.desc())
            .limit(10)
            .all()
        )
        recent_orders = [_order_to_dict(o) for o in recent_orders_raw]

        return DashboardSummary(
            total_orders=sum(counts.values()),
            pending_orders=counts.get("pending", 0),
            stitching_in_progress=counts.get("stitching_in_progress", 0),
            stitching_complete=counts.get("stitching_complete", 0),
            packing_in_progress=counts.get("packing_in_progress", 0),
            packing_complete=counts.get("packing_complete", 0),
            dispatched=counts.get("dispatched", 0),
            total_revenue_month=Decimal(str(monthly_revenue)),
            recent_orders=recent_orders,
            completed_today=completed_today,
            active_orders=active_orders,
            on_hold_orders=on_hold_orders,
            stitching_progress_pct=stitching_progress_pct,
            packing_progress_pct=packing_progress_pct,
            collected_month=Decimal(str(collected_month)),
            outstanding_total=Decimal(str(outstanding_total)),
            orders_this_month=orders_this_month,
            business_name=business_name,
            owner_name=owner_name,
        )


def _order_to_dict(order: Order) -> dict:
    return {
        "id": str(order.id),
        "order_number": order.order_number,
        "party_id": str(order.party_id) if order.party_id else None,
        "party_name": order.party.name if order.party else None,
        "goods_description": order.goods_description,
        "total_quantity": order.total_quantity,
        "status": order.status,
        "entry_date": order.entry_date.isoformat() if order.entry_date else None,
        "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
        "stitch_rate_party": str(order.stitch_rate_party),
        "stitch_rate_labor": str(order.stitch_rate_labor),
        "pack_rate_party": str(order.pack_rate_party) if order.pack_rate_party else None,
        "pack_rate_labor": str(order.pack_rate_labor) if order.pack_rate_labor else None,
        "party_reference": order.party_reference,
        "arrival_date": order.arrival_date.isoformat() if order.arrival_date else None,
        "estimated_completion": order.estimated_completion.isoformat() if order.estimated_completion else None,
        "actual_completion": order.actual_completion.isoformat() if order.actual_completion else None,
        "items": [
            {
                "id": str(i.id), "size": i.size,
                "quantity": i.quantity,
                "completed_quantity": i.completed_quantity,
                "packed_quantity": i.packed_quantity,
            }
            for i in order.items
        ],
    }
