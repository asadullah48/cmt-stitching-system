from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func

from app.core.deps import CurrentUser, DbDep
from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.schemas.parties import PartyCreate, PartyUpdate, PartyOut, PartyListResponse
from app.schemas.financial import PartyLedgerResponse, TransactionOut
from app.services.party_service import PartyService

DEBIT_TYPES = ("income", "expense", "purchase", "stock_consumption")
CREDIT_TYPES = ("payment", "adjustment")

router = APIRouter(prefix="/parties", tags=["parties"])


@router.get("/", response_model=PartyListResponse)
def list_parties(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    items, total = PartyService.get_all(db, page, size)
    return PartyListResponse(data=items, total=total, page=page, size=size)


@router.post("/", response_model=PartyOut, status_code=201)
def create_party(data: PartyCreate, db: DbDep, _: CurrentUser):
    return PartyService.create(db, data)


@router.get("/{party_id}", response_model=PartyOut)
def get_party(party_id: UUID, db: DbDep, _: CurrentUser):
    return PartyService.get_by_id(db, party_id)


@router.put("/{party_id}", response_model=PartyOut)
def update_party(party_id: UUID, data: PartyUpdate, db: DbDep, _: CurrentUser):
    return PartyService.update(db, party_id, data)


@router.delete("/{party_id}", status_code=204)
def delete_party(party_id: UUID, db: DbDep, _: CurrentUser):
    party = db.query(Party).filter(Party.id == party_id, Party.is_deleted.is_(False)).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    party.is_deleted = True
    db.commit()


@router.post("/{party_id}/recalculate-balance", response_model=PartyOut)
def recalculate_balance(party_id: UUID, db: DbDep, _: CurrentUser):
    """Recompute party.balance from scratch from all active transactions.
    Use this after manually correcting ledger entries to fix stale balance."""
    party = db.query(Party).filter(Party.id == party_id, Party.is_deleted.is_(False)).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    debit = db.query(func.sum(FinancialTransaction.amount)).filter(
        FinancialTransaction.party_id == party_id,
        FinancialTransaction.transaction_type.in_(DEBIT_TYPES),
        FinancialTransaction.is_deleted.is_(False),
    ).scalar() or Decimal("0")

    credit = db.query(func.sum(FinancialTransaction.amount)).filter(
        FinancialTransaction.party_id == party_id,
        FinancialTransaction.transaction_type.in_(CREDIT_TYPES),
        FinancialTransaction.is_deleted.is_(False),
    ).scalar() or Decimal("0")

    party.balance = Decimal(str(debit)) - Decimal(str(credit))
    db.commit()
    db.refresh(party)
    return party


@router.get("/{party_id}/ledger", response_model=PartyLedgerResponse)
def party_ledger(party_id: UUID, db: DbDep, _: CurrentUser):
    party, transactions = PartyService.get_ledger(db, party_id)
    txn_out = []
    for t in transactions:
        txn_out.append(TransactionOut(
            id=t.id,
            party_id=t.party_id,
            party_name=party.name,
            order_id=t.order_id,
            order_number=t.order.order_number if t.order else None,
            transaction_type=t.transaction_type,
            amount=t.amount,
            payment_method=t.payment_method,
            reference_number=t.reference_number,
            description=t.description,
            transaction_date=t.transaction_date,
        ))
    return PartyLedgerResponse(
        party_id=party.id,
        party_name=party.name,
        balance=party.balance,
        transactions=txn_out,
    )
