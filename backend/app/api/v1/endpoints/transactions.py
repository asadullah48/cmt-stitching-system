from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.financial import FinancialTransaction
from app.models.bill import Bill
from app.models.parties import Party
from app.schemas.financial import TransactionCreate, TransactionOut, TransactionListResponse
from app.services.financial_service import FinancialService
from app.services.bill_service import BillService

DEBIT_TYPES = {"income", "expense", "purchase", "stock_consumption"}
CREDIT_TYPES = {"payment", "adjustment"}


def _balance_delta(txn_type: str, amount) -> "Decimal":
    """Return the signed balance change for a transaction type."""
    from decimal import Decimal
    amt = Decimal(str(amount))
    if txn_type in DEBIT_TYPES:
        return amt       # debit = party owes us more
    if txn_type in CREDIT_TYPES:
        return -amt      # credit = party paid us
    return Decimal("0")


def _adjust_party_balance(db, party_id, delta):
    """Add delta to party.balance (use negative delta to reverse)."""
    from decimal import Decimal
    if not party_id or delta == Decimal("0"):
        return
    party = db.query(Party).filter(Party.id == party_id).with_for_update().first()
    if party:
        party.balance += delta

router = APIRouter(prefix="/transactions", tags=["transactions"])


class LinkBillRequest(BaseModel):
    bill_id: Optional[UUID] = None  # pass None to unlink


def _to_out(txn) -> TransactionOut:
    return TransactionOut(
        id=txn.id,
        party_id=txn.party_id,
        party_name=txn.party.name if txn.party else None,
        order_id=txn.order_id,
        order_number=txn.order.order_number if txn.order else None,
        bill_id=txn.bill_id,
        transaction_type=txn.transaction_type,
        amount=txn.amount,
        payment_method=txn.payment_method,
        reference_number=txn.reference_number,
        description=txn.description,
        transaction_date=txn.transaction_date,
    )


@router.get("/", response_model=TransactionListResponse)
def list_transactions(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    party_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    transaction_type: Optional[str] = Query(None),
    order_id: Optional[UUID] = Query(None),
):
    txns, total = FinancialService.get_all(db, page, size, party_id, date_from, date_to, transaction_type, order_id)
    return TransactionListResponse(data=[_to_out(t) for t in txns], total=total, page=page, size=size)


def _fetch_txn(db, txn_id):
    """Re-fetch a transaction with relationships eagerly loaded."""
    return (
        db.query(FinancialTransaction)
        .options(joinedload(FinancialTransaction.party), joinedload(FinancialTransaction.order))
        .filter(FinancialTransaction.id == txn_id)
        .first()
    )


@router.post("/", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, db: DbDep, current_user: CurrentUser):
    txn = FinancialService.create_transaction(db, data, current_user.id)
    # If a bill_id was provided on the transaction, recompute bill amounts
    if data.bill_id:
        bill = db.query(Bill).filter(Bill.id == data.bill_id, Bill.is_deleted.is_(False)).first()
        if bill:
            BillService._recompute_amount_paid(db, bill)
            db.commit()
    # Re-fetch with relationships so _to_out never hits expired lazy-load attributes
    txn = _fetch_txn(db, txn.id)
    return _to_out(txn)


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: UUID, data: TransactionCreate, db: DbDep, _: CurrentUser):
    """Update all fields of a transaction, keeping party balance consistent."""
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Reverse old balance effect
    _adjust_party_balance(db, txn.party_id, -_balance_delta(txn.transaction_type, txn.amount))

    txn.party_id = data.party_id
    txn.order_id = data.order_id
    txn.transaction_type = data.transaction_type
    txn.amount = data.amount
    txn.payment_method = data.payment_method
    txn.reference_number = data.reference_number
    txn.description = data.description
    txn.transaction_date = data.transaction_date

    # Apply new balance effect
    _adjust_party_balance(db, txn.party_id, _balance_delta(txn.transaction_type, txn.amount))

    db.commit()
    db.refresh(txn)
    return _to_out(txn)


@router.patch("/{transaction_id}/reference", response_model=TransactionOut)
def update_reference(transaction_id: UUID, reference_number: str, db: DbDep, _: CurrentUser):
    """Update the reference number of a transaction."""
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.reference_number = reference_number
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


@router.patch("/{transaction_id}/party", response_model=TransactionOut)
def reassign_party(transaction_id: UUID, party_id: UUID, db: DbDep, _: CurrentUser):
    """Reassign a transaction to a different party (used for party merges)."""
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.party_id = party_id
    db.commit()
    db.refresh(txn)
    return _to_out(txn)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: UUID, db: DbDep, _: CurrentUser):
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Reverse the balance effect before soft-deleting
    _adjust_party_balance(db, txn.party_id, -_balance_delta(txn.transaction_type, txn.amount))

    old_bill_id = txn.bill_id
    txn.is_deleted = True
    db.flush()
    # Recompute bill if this transaction was linked to one
    if old_bill_id:
        bill = db.query(Bill).filter(Bill.id == old_bill_id, Bill.is_deleted.is_(False)).first()
        if bill:
            BillService._recompute_amount_paid(db, bill)
    db.commit()


@router.patch("/{transaction_id}/link-bill", response_model=TransactionOut)
def link_transaction_to_bill(
    transaction_id: UUID,
    body: LinkBillRequest,
    db: DbDep,
    _: CurrentUser,
):
    """Link (or unlink) a payment transaction to a specific bill.

    Pass ``{"bill_id": "<uuid>"}`` to link, or ``{"bill_id": null}`` to unlink.
    After updating, bill.amount_paid and payment_status are recomputed from all
    linked transactions so the bill always reflects the true collected amount.
    """
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    old_bill_id = txn.bill_id

    # Validate new bill if provided
    new_bill = None
    if body.bill_id is not None:
        new_bill = db.query(Bill).filter(Bill.id == body.bill_id, Bill.is_deleted.is_(False)).first()
        if not new_bill:
            raise HTTPException(status_code=404, detail="Bill not found")

    txn.bill_id = body.bill_id
    db.flush()

    # Recompute old bill (if unlinking or changing bills)
    if old_bill_id and old_bill_id != body.bill_id:
        old_bill = db.query(Bill).filter(Bill.id == old_bill_id, Bill.is_deleted.is_(False)).first()
        if old_bill:
            BillService._recompute_amount_paid(db, old_bill)

    # Recompute new bill
    if new_bill:
        BillService._recompute_amount_paid(db, new_bill)

    db.commit()
    db.refresh(txn)
    return _to_out(txn)
