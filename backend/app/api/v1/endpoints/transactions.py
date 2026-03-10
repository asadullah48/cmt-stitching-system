from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import CurrentUser, DbDep
from app.models.financial import FinancialTransaction
from app.schemas.financial import TransactionCreate, TransactionOut, TransactionListResponse
from app.services.financial_service import FinancialService

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _to_out(txn) -> TransactionOut:
    return TransactionOut(
        id=txn.id,
        party_id=txn.party_id,
        party_name=txn.party.name if txn.party else None,
        order_id=txn.order_id,
        order_number=txn.order.order_number if txn.order else None,
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


@router.post("/", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, db: DbDep, current_user: CurrentUser):
    txn = FinancialService.create_transaction(db, data, current_user.id)
    return _to_out(txn)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: UUID, db: DbDep, _: CurrentUser):
    txn = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.is_deleted.is_(False),
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.is_deleted = True
    db.commit()
