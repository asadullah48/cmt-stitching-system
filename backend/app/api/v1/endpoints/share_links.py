from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.share_link import ShareLink
from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.schemas.share_link import (
    ShareLinkCreate, ShareLinkOut, ShareLinkListResponse,
    PublicStatementOut, PublicTransactionRow,
)

router = APIRouter(tags=["share-links"])

DEBIT_TYPES = {"income", "expense", "purchase", "stock_consumption"}


def _to_out(link: ShareLink) -> ShareLinkOut:
    return ShareLinkOut(
        id=link.id,
        token=link.token,
        party_id=link.party_id,
        party_name=link.party.name if link.party else None,
        date_from=link.date_from,
        date_to=link.date_to,
        created_at=link.created_at,
        is_revoked=link.is_revoked,
    )


@router.post("/share-links/", response_model=ShareLinkOut, status_code=201)
def create_share_link(data: ShareLinkCreate, db: DbDep, current_user: CurrentUser):
    """Create a new share link for a party statement."""
    party = db.query(Party).filter(Party.id == data.party_id, Party.is_deleted.is_(False)).first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    link = ShareLink(
        party_id=data.party_id,
        date_from=data.date_from,
        date_to=data.date_to,
        created_by=current_user.id,
    )
    db.add(link)
    db.commit()
    link = db.query(ShareLink).options(joinedload(ShareLink.party)).filter(ShareLink.id == link.id).first()
    return _to_out(link)


@router.get("/share-links/", response_model=ShareLinkListResponse)
def list_share_links(
    db: DbDep,
    _: CurrentUser,
    party_id: Optional[UUID] = Query(None),
):
    """List all share links, optionally filtered by party."""
    q = db.query(ShareLink).options(joinedload(ShareLink.party))
    if party_id:
        q = q.filter(ShareLink.party_id == party_id)
    links = q.order_by(ShareLink.created_at.desc()).all()
    return ShareLinkListResponse(data=[_to_out(l) for l in links], total=len(links))


@router.delete("/share-links/{link_id}", status_code=204)
def revoke_share_link(link_id: UUID, db: DbDep, _: CurrentUser):
    """Revoke (soft-disable) a share link."""
    link = db.query(ShareLink).filter(ShareLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    link.is_revoked = True
    db.commit()


@router.get("/public/statement/{token}", response_model=PublicStatementOut)
def get_public_statement(token: UUID, db: DbDep):
    """Public read-only party statement. No authentication required."""
    link = (
        db.query(ShareLink)
        .filter(ShareLink.token == token, ShareLink.is_revoked.is_(False))
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="This link is invalid or has been revoked.")

    party = db.query(Party).filter(Party.id == link.party_id).first()
    party_name = party.name if party else "Unknown Party"

    txns = (
        db.query(FinancialTransaction)
        .filter(
            FinancialTransaction.party_id == link.party_id,
            FinancialTransaction.transaction_date >= link.date_from,
            FinancialTransaction.transaction_date <= link.date_to,
            FinancialTransaction.is_deleted.is_(False),
        )
        .order_by(FinancialTransaction.transaction_date.asc())
        .all()
    )

    rows = []
    running = 0.0
    total_debit = 0.0
    total_credit = 0.0

    for tx in txns:
        amount = float(tx.amount)
        if tx.transaction_type in DEBIT_TYPES:
            running += amount
            total_debit += amount
            rows.append(PublicTransactionRow(
                transaction_date=tx.transaction_date,
                transaction_type=tx.transaction_type,
                description=tx.description,
                reference_number=tx.reference_number,
                payment_method=tx.payment_method,
                debit=amount,
                credit=None,
                running_balance=running,
            ))
        else:
            running -= amount
            total_credit += amount
            rows.append(PublicTransactionRow(
                transaction_date=tx.transaction_date,
                transaction_type=tx.transaction_type,
                description=tx.description,
                reference_number=tx.reference_number,
                payment_method=tx.payment_method,
                debit=None,
                credit=amount,
                running_balance=running,
            ))

    return PublicStatementOut(
        party_name=party_name,
        date_from=link.date_from,
        date_to=link.date_to,
        transactions=rows,
        total_debit=total_debit,
        total_credit=total_credit,
        outstanding_balance=running,
    )
