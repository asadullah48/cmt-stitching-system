from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import case, func
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
            (FinancialTransaction.transaction_type == "income", 1),   # A-series stitching
            (FinancialTransaction.transaction_type == "accessories", 2),  # B-series
            (FinancialTransaction.transaction_type == "packing", 3),  # C-series
            (FinancialTransaction.transaction_type == "misc", 4),     # D-series
            (FinancialTransaction.transaction_type == "expense_material", 5),
            (FinancialTransaction.transaction_type == "expense_transport", 5),
            (FinancialTransaction.transaction_type == "expense_misc", 5),
            (FinancialTransaction.transaction_type == "expense", 5),
            (FinancialTransaction.transaction_type == "purchase", 5),
            (FinancialTransaction.transaction_type == "stock_consumption", 5),
            (FinancialTransaction.transaction_type == "payment", 6),
            (FinancialTransaction.transaction_type == "adjustment", 7),
            else_=8,
        )
        txns = q.order_by(
            FinancialTransaction.transaction_date.asc(),
            type_order,
            FinancialTransaction.created_at.asc(),
        ).offset((page - 1) * size).limit(size).all()
        return txns, total

    # ------------------------------------------------------------------ #
    # Reporting / export helpers                                         #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _period_expr(group_by: str):
        """Postgres period bucket for the transaction_date column."""
        col = FinancialTransaction.transaction_date
        if group_by == "week":
            return func.to_char(func.date_trunc("week", col), 'IYYY-"W"IW')  # 2026-W27
        if group_by == "month":
            return func.to_char(col, "YYYY-MM")                               # 2026-07
        return func.to_char(col, "YYYY-MM-DD")                                # 2026-07-01 (day)

    @staticmethod
    def _apply_filters(q, party_id, order_id, date_from, date_to, transaction_type):
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
        return q

    @staticmethod
    def get_summary(
        db: Session,
        group_by: str = "day",
        party_id: Optional[UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        transaction_type: Optional[str] = None,
        order_id: Optional[UUID] = None,
    ) -> list:
        """Aggregate amount + count by period and transaction_type."""
        period = FinancialService._period_expr(group_by)
        q = (
            db.query(
                period.label("period"),
                FinancialTransaction.transaction_type.label("transaction_type"),
                func.count().label("count"),
                func.coalesce(func.sum(FinancialTransaction.amount), 0).label("total"),
            )
            .filter(FinancialTransaction.is_deleted.is_(False))
        )
        q = FinancialService._apply_filters(q, party_id, order_id, date_from, date_to, transaction_type)
        return (
            q.group_by(period, FinancialTransaction.transaction_type)
            .order_by(period, FinancialTransaction.transaction_type)
            .all()
        )

    @staticmethod
    def get_for_export(
        db: Session,
        party_id: Optional[UUID] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        transaction_type: Optional[str] = None,
        order_id: Optional[UUID] = None,
    ) -> list[FinancialTransaction]:
        """All matching transactions (no pagination) for CSV/XLSX export."""
        q = (
            db.query(FinancialTransaction)
            .options(joinedload(FinancialTransaction.party), joinedload(FinancialTransaction.order))
            .filter(FinancialTransaction.is_deleted.is_(False))
        )
        q = FinancialService._apply_filters(q, party_id, order_id, date_from, date_to, transaction_type)
        return q.order_by(
            FinancialTransaction.transaction_date.asc(),
            FinancialTransaction.created_at.asc(),
        ).all()
