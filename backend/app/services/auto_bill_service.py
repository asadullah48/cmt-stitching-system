"""
auto_bill_service.py — Auto-generate party, labour, and vendor bills on order dispatch.

When an order is dispatched (via button or packing_complete hook):
  1. Find all active rate templates whose goods_type keyword appears in the order's goods_description.
  2. For each template:
     - Create a customer bill (A/B/C series) against the order's party.
     - Post a labour debit transaction against CMT Labour party (if labour_rate > 0).
     - Post a vendor debit transaction against CMT Vendors party (if vendor_rate > 0).
  3. Mark the order as dispatched.

Idempotent: skips any bill series that already has a bill for this order.
"""

from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.bill_rate_templates import BillRateTemplate
from app.models.financial import FinancialTransaction
from app.models.orders import Order
from app.models.parties import Party
from app.services.bill_service import BillService
from app.schemas.bill import BillCreate


def _get_internal_party(db: Session, party_type: str) -> Party | None:
    return (
        db.query(Party)
        .filter(Party.party_type == party_type, Party.is_deleted.is_(False))
        .first()
    )


def _existing_series(db: Session, order_id: UUID) -> set[str]:
    """Return set of bill series already created for this order."""
    rows = (
        db.query(Bill.bill_series)
        .filter(Bill.order_id == order_id, Bill.is_deleted.is_(False))
        .all()
    )
    return {r[0].upper() for r in rows}


def _matching_templates(db: Session, goods_description: str) -> list[BillRateTemplate]:
    templates = (
        db.query(BillRateTemplate)
        .filter(BillRateTemplate.is_active.is_(True), BillRateTemplate.is_deleted.is_(False))
        .all()
    )
    desc_lower = goods_description.lower()
    return [t for t in templates if t.goods_type.lower() in desc_lower]


def auto_generate_bills(db: Session, order: Order, user_id: UUID, bill_date: date_type) -> list[Bill]:
    """
    Generate all applicable bills for an order on dispatch.
    Returns the list of newly created customer bills.
    """
    if not order.party_id:
        return []

    templates = _matching_templates(db, order.goods_description)
    if not templates:
        return []

    existing = _existing_series(db, order.id)
    qty = Decimal(str(order.total_quantity))

    labour_party = _get_internal_party(db, "labour")
    vendor_party  = _get_internal_party(db, "vendor")

    created_bills: list[Bill] = []

    for tmpl in templates:
        series = tmpl.bill_series.upper()

        # ── Customer bill ─────────────────────────────────────────────
        if series not in existing and tmpl.customer_rate > 0:
            amount = Decimal(str(tmpl.customer_rate)) * qty
            desc = f"{tmpl.description} — {order.goods_description}" if tmpl.description else order.goods_description
            bill = BillService.create(
                db,
                BillCreate(
                    order_id=order.id,
                    bill_series=series,
                    bill_date=bill_date,
                    amount_due=amount,
                    description=desc,
                ),
                user_id,
            )
            created_bills.append(bill)
            existing.add(series)  # prevent duplicate within same run

        # ── Labour debit transaction ──────────────────────────────────
        if labour_party and tmpl.labour_rate > 0:
            labour_amount = Decimal(str(tmpl.labour_rate)) * qty
            db.add(FinancialTransaction(
                party_id=labour_party.id,
                order_id=order.id,
                transaction_type="expense_material",
                amount=labour_amount,
                reference_number=order.order_number,
                description=f"Labour — {tmpl.description or series}-series — {order.goods_description}",
                transaction_date=bill_date,
                created_by=user_id,
            ))
            labour_party.balance += labour_amount

        # ── Vendor debit transaction ──────────────────────────────────
        if vendor_party and tmpl.vendor_rate > 0:
            vendor_amount = Decimal(str(tmpl.vendor_rate)) * qty
            db.add(FinancialTransaction(
                party_id=vendor_party.id,
                order_id=order.id,
                transaction_type="expense_material",
                amount=vendor_amount,
                reference_number=order.order_number,
                description=f"Vendor — {tmpl.description or series}-series — {order.goods_description}",
                transaction_date=bill_date,
                created_by=user_id,
            ))
            vendor_party.balance += vendor_amount

    # Mark dispatched if not already
    if order.status != "dispatched":
        order.status = "dispatched"
        order.dispatch_date = bill_date
        order.actual_completion = bill_date

    db.commit()
    return created_bills
