from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import CurrentUser, DbDep
from app.schemas.bill import BillCreate, BillOut, BillListResponse, BillPaymentUpdate, NextBillNumber
from app.services.bill_service import BillService

router = APIRouter(prefix="/bills", tags=["bills"])


def _to_out(bill) -> BillOut:
    from decimal import Decimal

    # Build order items list with computed amounts
    order_items = []
    subtotal = Decimal("0")
    if bill.order and hasattr(bill.order, "items") and bill.order.items:
        stitch_rate = Decimal(str(bill.order.stitch_rate_party or 0))
        pack_rate = Decimal(str(bill.order.pack_rate_party or 0))
        for item in bill.order.items:
            qty = item.quantity or 0
            amount = qty * (stitch_rate + pack_rate)
            subtotal += amount
            order_items.append({
                "size": item.size,
                "quantity": qty,
                "stitch_rate": float(stitch_rate),
                "pack_rate": float(pack_rate),
                "amount": float(amount),
                "description": bill.order.goods_description,
            })
    else:
        # Fallback: subtotal from amount_due + discount
        discount = Decimal(str(bill.discount)) if bill.discount else Decimal("0")
        subtotal = Decimal(str(bill.amount_due)) + discount

    discount = Decimal(str(bill.discount)) if hasattr(bill, "discount") and bill.discount is not None else Decimal("0")
    previous_balance = Decimal(str(bill.previous_balance)) if hasattr(bill, "previous_balance") and bill.previous_balance is not None else Decimal("0")

    return BillOut(
        id=bill.id,
        bill_number=bill.bill_number,
        bill_series=bill.bill_series,
        bill_sequence=bill.bill_sequence,
        order_id=bill.order_id,
        order_number=bill.order.order_number if bill.order else None,
        party_id=bill.party_id,
        party_name=bill.party.name if bill.party else None,
        party_contact_person=bill.party.contact_person if bill.party else None,
        party_phone=bill.party.phone if bill.party else None,
        party_address=bill.party.address if bill.party else None,
        bill_date=bill.bill_date,
        carrier=bill.carrier,
        tracking_number=bill.tracking_number,
        carton_count=bill.carton_count,
        total_weight=bill.total_weight,
        payment_status=bill.payment_status,
        amount_due=bill.amount_due,
        amount_paid=bill.amount_paid,
        amount_outstanding=bill.amount_due - bill.amount_paid,
        discount=discount,
        previous_balance=previous_balance,
        subtotal=subtotal,
        order_items=order_items,
        notes=bill.notes,
    )


@router.get("/next-number", response_model=NextBillNumber)
def get_next_number(db: DbDep, _: CurrentUser, series: str = Query("A")):
    """Return the next auto-generated bill number for a given series."""
    next_num, seq = BillService.next_number(db, series)
    return NextBillNumber(series=series.upper(), next_number=next_num, next_sequence=seq)


@router.get("/", response_model=BillListResponse)
def list_bills(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    series: Optional[str] = Query(None),
    party_id: Optional[UUID] = Query(None),
    order_id: Optional[UUID] = Query(None),
    payment_status: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """List all bills with optional filtering by series, party, order, payment status, and date range."""
    bills, total = BillService.get_all(db, page, size, series, party_id, payment_status, date_from, date_to, order_id)
    return BillListResponse(data=[_to_out(b) for b in bills], total=total, page=page, size=size)


@router.post("/", response_model=BillOut, status_code=201)
def create_bill(data: BillCreate, db: DbDep, current_user: CurrentUser):
    """
    Create a new bill for an order.

    Triggers:
    - Order status → dispatched
    - FinancialTransaction(type="income") posted to the party ledger
    - Inventory out via BOM logic (if applicable)
    """
    try:
        bill = BillService.create(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_out(bill)


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(bill_id: UUID, db: DbDep, _: CurrentUser):
    """Retrieve a single bill by ID."""
    bill = BillService.get_by_id(db, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _to_out(bill)


@router.patch("/{bill_id}/payment", response_model=BillOut)
def record_payment(bill_id: UUID, data: BillPaymentUpdate, db: DbDep, current_user: CurrentUser):
    """
    Record a payment against a bill.

    Creates a FinancialTransaction(type="payment") and updates payment_status
    (unpaid → partial → paid) based on the running total.
    """
    try:
        bill = BillService.record_payment(db, bill_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_out(bill)
