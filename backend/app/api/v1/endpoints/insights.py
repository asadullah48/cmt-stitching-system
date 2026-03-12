from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.bill import Bill
from app.models.config import Config
from app.models.expenses import Expense
from app.models.financial import FinancialTransaction
from app.models.inventory import InventoryItem
from app.models.orders import Order
from app.models.parties import Party
from app.models.production import ProductionSession
from pydantic import BaseModel

router = APIRouter(prefix="/insights", tags=["insights"])


# ── Response schemas ────────────────────────────────────────────────────────

class Alert(BaseModel):
    id: str              # unique key, used for client-side dismissal
    level: str           # "warning" | "info"
    message: str
    detail: Optional[str] = None
    link: Optional[str] = None


class TrendPoint(BaseModel):
    label: str           # e.g. "2025-02", "2025-03"
    income: float
    expenses: float
    orders: int


class TopParty(BaseModel):
    party_name: str
    total_billed: float
    order_count: int


class TrendsOut(BaseModel):
    monthly: list[TrendPoint]
    top_parties: list[TopParty]
    avg_order_turnaround_days: Optional[float]
    production_hours_this_month: Optional[float]


# ── Config helper ───────────────────────────────────────────────────────────

def _cfg(db: Session, key: str, default: str) -> str:
    row = db.query(Config).filter(Config.key == key).first()
    return row.value if row else default


# ── Smart alerts endpoint ───────────────────────────────────────────────────

@router.get("/smart", response_model=list[Alert])
def get_smart_insights(db: DbDep, _: CurrentUser):
    """Run rule-based checks and return a list of actionable alerts."""
    alerts: list[Alert] = []
    today = date.today()

    no_bill_days = int(_cfg(db, "no_bill_alert_days", "3"))
    hold_days = int(_cfg(db, "goods_on_hold_alert_days", "5"))
    outstanding_days = int(_cfg(db, "outstanding_alert_days", "30"))
    rate_dev_pct = int(_cfg(db, "rate_deviation_pct", "10"))

    # ── Check 1: packing_complete orders with no bill older than threshold ──
    cutoff = today - timedelta(days=no_bill_days)
    unbilled = (
        db.query(Order)
        .outerjoin(Bill, (Bill.order_id == Order.id) & Bill.is_deleted.is_(False))
        .filter(
            Order.status == "packing_complete",
            Order.is_deleted.is_(False),
            Bill.id.is_(None),
            func.date(Order.updated_at) <= cutoff,
        )
        .all()
    )
    if unbilled:
        oldest_days = (today - min(o.updated_at.date() for o in unbilled)).days
        alerts.append(Alert(
            id="unbilled_orders",
            level="warning",
            message=f"{len(unbilled)} order(s) packed but not billed",
            detail=f"Oldest is {oldest_days} days overdue",
            link="/dispatch",
        ))

    # ── Check 2: orders pending (goods on hold) longer than threshold ──
    hold_cutoff = today - timedelta(days=hold_days)
    on_hold = (
        db.query(Order)
        .filter(
            Order.status == "pending",
            Order.is_deleted.is_(False),
            func.date(Order.entry_date) <= hold_cutoff,
        )
        .all()
    )
    if on_hold:
        alerts.append(Alert(
            id="goods_on_hold",
            level="warning",
            message=f"{len(on_hold)} order(s) on hold without progress",
            detail=f"Waiting more than {hold_days} days",
            link="/orders",
        ))

    # ── Check 3: missing pack rate (party usually has it) ──
    orders_no_pack = (
        db.query(Order)
        .filter(
            Order.pack_rate_party.is_(None),
            Order.status.notin_(["dispatched"]),
            Order.is_deleted.is_(False),
            Order.party_id.isnot(None),
        )
        .all()
    )
    missing_pack = []
    for order in orders_no_pack:
        last_5 = (
            db.query(Order)
            .filter(
                Order.party_id == order.party_id,
                Order.id != order.id,
                Order.is_deleted.is_(False),
                Order.pack_rate_party.isnot(None),
            )
            .order_by(Order.created_at.desc())
            .limit(5)
            .all()
        )
        if len(last_5) >= 2:
            missing_pack.append(order.order_number)
    if missing_pack:
        alerts.append(Alert(
            id="missing_pack_rate",
            level="warning",
            message=f"{len(missing_pack)} order(s) missing pack rate",
            detail=f"Party usually charged pack rate: {', '.join(missing_pack[:3])}{'…' if len(missing_pack) > 3 else ''}",
            link="/orders",
        ))

    # ── Check 4: rate deviation from party's usual ──
    active_orders = (
        db.query(Order)
        .filter(
            Order.status.notin_(["dispatched"]),
            Order.is_deleted.is_(False),
            Order.party_id.isnot(None),
            Order.stitch_rate_party.isnot(None),
        )
        .all()
    )
    rate_issues = []
    for order in active_orders:
        last_5_rates = (
            db.query(Order.stitch_rate_party)
            .filter(
                Order.party_id == order.party_id,
                Order.id != order.id,
                Order.is_deleted.is_(False),
                Order.stitch_rate_party.isnot(None),
            )
            .order_by(Order.created_at.desc())
            .limit(5)
            .all()
        )
        if len(last_5_rates) >= 3:
            rates = [float(r[0]) for r in last_5_rates if r[0] is not None]
            if rates:
                avg = sum(rates) / len(rates)
                if avg > 0 and order.stitch_rate_party is not None:
                    deviation = abs(float(order.stitch_rate_party) - avg) / avg * 100
                    if deviation > rate_dev_pct:
                        rate_issues.append(order.order_number)
    if rate_issues:
        alerts.append(Alert(
            id="rate_deviation",
            level="info",
            message=f"{len(rate_issues)} order(s) have unusual stitch rates",
            detail=f"Rate differs from party average by >{rate_dev_pct}%: {', '.join(rate_issues[:3])}{'…' if len(rate_issues) > 3 else ''}",
            link="/orders",
        ))

    # ── Check 5: outstanding balance older than threshold days ──
    outstanding_cutoff = today - timedelta(days=outstanding_days)
    old_bills = (
        db.query(Bill)
        .options(joinedload(Bill.party))
        .filter(
            Bill.payment_status.in_(["unpaid", "partial"]),
            Bill.is_deleted.is_(False),
            Bill.bill_date <= outstanding_cutoff,
        )
        .all()
    )
    if old_bills:
        total_outstanding = sum(
            float(b.amount_due - b.amount_paid) for b in old_bills
        )
        party_names = list({b.party.name for b in old_bills if b.party})[:3]
        alerts.append(Alert(
            id="outstanding_balance",
            level="warning",
            message=f"PKR {total_outstanding:,.0f} outstanding for >{outstanding_days} days",
            detail=f"Parties: {', '.join(party_names)}" if party_names else None,
            link="/ledger",
        ))

    # ── Check 6: inventory items below minimum stock ──
    low_stock = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_deleted.is_(False),
            InventoryItem.minimum_stock > 0,
            InventoryItem.current_stock < InventoryItem.minimum_stock,
        )
        .all()
    )
    if low_stock:
        items = [f"{i.name} ({i.current_stock} {i.unit})" for i in low_stock[:3]]
        alerts.append(Alert(
            id="low_stock",
            level="warning",
            message=f"{len(low_stock)} inventory item(s) below minimum",
            detail=", ".join(items) + ("…" if len(low_stock) > 3 else ""),
            link="/inventory",
        ))

    return alerts


# ── Trends endpoint ─────────────────────────────────────────────────────────

@router.get("/trends", response_model=TrendsOut)
def get_trends(db: DbDep, _: CurrentUser, months: int = 6):
    """Return trend data: monthly income vs expenses, top parties, and efficiency metrics."""
    today = date.today()
    months = max(1, min(months, 12))  # clamp between 1–12

    # Build list of (year, month) for the last N months
    monthly_data: list[TrendPoint] = []
    for i in range(months - 1, -1, -1):
        # Work backwards from current month
        month_offset = today.month - 1 - i
        year_offset = today.year + (month_offset // 12)
        month = (month_offset % 12) + 1
        year = year_offset
        # Correct negative month calculation
        if today.month - 1 - i < 0:
            neg = -(today.month - 1 - i)
            year = today.year - ((neg - 1) // 12 + 1)
            month = 12 - ((neg - 1) % 12)

        label = f"{year:04d}-{month:02d}"

        # Income: sum of FinancialTransaction (type=income) for this month
        income = (
            db.query(func.coalesce(func.sum(FinancialTransaction.amount), 0))
            .filter(
                FinancialTransaction.transaction_type == "income",
                FinancialTransaction.is_deleted.is_(False),
                func.extract("year", FinancialTransaction.transaction_date) == year,
                func.extract("month", FinancialTransaction.transaction_date) == month,
            )
            .scalar()
        ) or Decimal("0")

        # Expenses: sum of Expense table for this month
        expenses = (
            db.query(func.coalesce(func.sum(Expense.amount), 0))
            .filter(
                Expense.is_deleted.is_(False),
                func.extract("year", Expense.expense_date) == year,
                func.extract("month", Expense.expense_date) == month,
            )
            .scalar()
        ) or Decimal("0")

        # Order count for this month (by entry_date)
        order_count = (
            db.query(func.count(Order.id))
            .filter(
                Order.is_deleted.is_(False),
                func.extract("year", Order.entry_date) == year,
                func.extract("month", Order.entry_date) == month,
            )
            .scalar()
        ) or 0

        monthly_data.append(TrendPoint(
            label=label,
            income=float(income),
            expenses=float(expenses),
            orders=order_count,
        ))

    # ── Top parties by billed amount (from Bill table) ──
    top_parties_raw = (
        db.query(
            Party.name,
            func.sum(Bill.amount_due).label("total_billed"),
            func.count(Bill.id).label("order_count"),
        )
        .join(Bill, Bill.party_id == Party.id)
        .filter(
            Party.is_deleted.is_(False),
            Bill.is_deleted.is_(False),
        )
        .group_by(Party.id, Party.name)
        .order_by(func.sum(Bill.amount_due).desc())
        .limit(5)
        .all()
    )
    top_parties = [
        TopParty(
            party_name=row.name,
            total_billed=float(row.total_billed or 0),
            order_count=row.order_count,
        )
        for row in top_parties_raw
    ]

    # ── Average order turnaround: entry_date to actual_completion ──
    turnaround_rows = (
        db.query(Order.entry_date, Order.actual_completion)
        .filter(
            Order.is_deleted.is_(False),
            Order.actual_completion.isnot(None),
            Order.entry_date.isnot(None),
        )
        .limit(100)
        .all()
    )
    avg_turnaround = None
    if turnaround_rows:
        days_list = [
            (r.actual_completion - r.entry_date).days
            for r in turnaround_rows
            if r.actual_completion >= r.entry_date
        ]
        if days_list:
            avg_turnaround = sum(days_list) / len(days_list)

    # ── Production hours this month (sum of duration_hours) ──
    prod_hours = (
        db.query(func.coalesce(func.sum(ProductionSession.duration_hours), 0))
        .filter(
            ProductionSession.is_deleted.is_(False),
            func.extract("year", ProductionSession.session_date) == today.year,
            func.extract("month", ProductionSession.session_date) == today.month,
        )
        .scalar()
    )
    prod_hours_float = float(prod_hours) if prod_hours else None

    return TrendsOut(
        monthly=monthly_data,
        top_parties=top_parties,
        avg_order_turnaround_days=avg_turnaround,
        production_hours_this_month=prod_hours_float,
    )
