from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.models.orders import Order
from app.schemas.financial import TransactionCreate
from app.services.audit_service import AuditService


class FinancialService:
    @staticmethod
    def create_transaction(db: Session, data: TransactionCreate, user_id: UUID) -> FinancialTransaction:
        txn = FinancialTransaction(
            party_id=data.party_id,
            order_id=data.order_id,
            bill_id=data.bill_id if hasattr(data, "bill_id") else None,
            transaction_type=data.transaction_type,
            amount=data.amount,
            payment_method=data.payment_method,
            reference_number=data.reference_number,
            description=data.description,
            transaction_date=data.transaction_date,
            created_by=user_id,
        )
        db.add(txn)
        db.flush()

        # Update party balance atomically
        if data.party_id:
            party = db.query(Party).filter(Party.id == data.party_id).with_for_update().first()
            if party:
                if data.transaction_type == "income":
                    party.balance += data.amount
                elif data.transaction_type == "payment":
                    party.balance -= data.amount
                # adjustments handled as-is (could be positive or negative)

        AuditService.log_create(
            db, "cmt_financial_transactions", txn.id,
            {"transaction_type": data.transaction_type, "amount": str(data.amount)},
            user_id,
        )
        db.commit()
        db.refresh(txn)
        return txn

    @staticmethod
    def get_all(
        db: Session,
        page: int = 1,
        size: int = 20,
        party_id: Optional[UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        transaction_type: Optional[str] = None,
        order_id: Optional[UUID] = None,
    ) -> tuple[list[FinancialTransaction], int]:
        q = (
            db.query(FinancialTransaction)
            .options(joinedload(FinancialTransaction.party), joinedload(FinancialTransaction.order))
            .filter(FinancialTransaction.is_deleted.is_(False))
        )
        if party_id:
            q = q.filter(FinancialTransaction.party_id == party_id)
        if order_id:
            q = q.filter(FinancialTransaction.order_id == order_id)
        if date_from:
            q = q.filter(FinancialTransaction.transaction_date >= date_from)
        if date_to:
            q = q.filter(FinancialTransaction.transaction_date <= date_to)
        if transaction_type:
            q = q.filter(FinancialTransaction.transaction_type == transaction_type)

        total = q.count()
        type_order = case(
            (FinancialTransaction.transaction_type == "income", 1),
            (FinancialTransaction.transaction_type == "expense", 2),
            (FinancialTransaction.transaction_type == "purchase", 2),
            else_=3,
        )
        txns = q.order_by(
            FinancialTransaction.transaction_date.asc(),
            type_order,
            FinancialTransaction.created_at.asc(),
        ).offset((page - 1) * size).limit(size).all()
        return txns, total
