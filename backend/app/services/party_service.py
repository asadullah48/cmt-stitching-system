from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from sqlalchemy.orm import joinedload

from app.models.parties import Party
from app.models.financial import FinancialTransaction
from app.schemas.parties import PartyCreate, PartyUpdate


class PartyService:
    @staticmethod
    def create(db: Session, data: PartyCreate) -> Party:
        party = Party(**data.model_dump())
        db.add(party)
        db.commit()
        db.refresh(party)
        return party

    @staticmethod
    def get_all(db: Session, page: int = 1, size: int = 20) -> tuple[list[Party], int]:
        q = db.query(Party).filter(Party.is_deleted.is_(False))
        total = q.count()
        items = q.order_by(Party.name).offset((page - 1) * size).limit(size).all()
        return items, total

    @staticmethod
    def get_by_id(db: Session, party_id: UUID) -> Party:
        party = db.query(Party).filter(Party.id == party_id, Party.is_deleted.is_(False)).first()
        if not party:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Party not found")
        return party

    @staticmethod
    def update(db: Session, party_id: UUID, data: PartyUpdate) -> Party:
        party = PartyService.get_by_id(db, party_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(party, field, value)
        db.commit()
        db.refresh(party)
        return party

    @staticmethod
    def get_ledger(db: Session, party_id: UUID) -> tuple[Party, list[FinancialTransaction]]:
        party = PartyService.get_by_id(db, party_id)
        transactions = (
            db.query(FinancialTransaction)
            .options(joinedload(FinancialTransaction.order))
            .filter(
                FinancialTransaction.party_id == party_id,
                FinancialTransaction.is_deleted.is_(False),
            )
            .order_by(FinancialTransaction.transaction_date.asc())
            .all()
        )
        return party, transactions
