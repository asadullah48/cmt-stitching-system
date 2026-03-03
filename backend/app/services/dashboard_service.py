from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.orders import Order
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
