"""
bill_service.py — Business logic for Bill creation, payment recording, and retrieval.

Responsibilities:
  - Auto-generate or validate manual bill numbers within a series (e.g. A01, B07).
  - Create a Bill record, mark the order as dispatched, and post an income ledger entry.
  - Record partial/full payments, update party balance, and flip payment_status.
  - Provide paginated list and single-record lookups with eager-loaded relationships.
"""

from datetime import date as date_type
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.orders import Order
from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.schemas.bill import BillCreate, BillPaymentUpdate
from app.services.audit_service import AuditService


class BillService:

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def next_number(db: Session, series: str) -> tuple[str, int]:
        """Return (next_bill_number, next_sequence) for a given series.

        Queries the highest existing bill_sequence in the series and
        increments by one, starting at 1 for a brand-new series.
        The bill_number is zero-padded to at least 2 digits (e.g. A01, A12).
        """
        series = series.strip().upper()
        last = (
            db.query(Bill)
            .filter(Bill.bill_series == series, Bill.is_deleted.is_(False))
            .order_by(Bill.bill_sequence.desc())
            .first()
        )
        seq = (last.bill_sequence + 1) if last else 1
        return f"{series}{seq:02d}", seq

    @staticmethod
    def _parse_manual_number(bill_number: str) -> tuple[str, int]:
        """Parse a manual bill number like 'A51' or 'AB07' into (series, sequence).

        Supports multi-character alphabetic prefixes (e.g. 'AB').
        Raises ValueError if the format is invalid.
        """
        i = 0
        while i < len(bill_number) and bill_number[i].isalpha():
            i += 1
        if i == 0 or i == len(bill_number):
            raise ValueError(
                f"Invalid bill number format: {bill_number!r}. "
                "Expected alphabetic prefix followed by digits, e.g. A51 or B07."
            )
        series = bill_number[:i].upper()
        try:
            seq = int(bill_number[i:])
        except ValueError:
            raise ValueError(f"Invalid bill number format: {bill_number!r}. Numeric suffix could not be parsed.")
        return series, seq

    @staticmethod
    def _recompute_amount_paid(db: Session, bill: Bill) -> Decimal:
        """Recompute amount_paid as SUM of non-deleted payment transactions linked to this bill.

        Also updates bill.amount_paid and bill.payment_status in place (does NOT commit).
        Returns the recomputed amount_paid.
        """
        computed = (
            db.query(func.sum(FinancialTransaction.amount))
            .filter(
                FinancialTransaction.bill_id == bill.id,
                FinancialTransaction.is_deleted.is_(False),
            )
            .scalar()
        ) or Decimal("0")
        bill.amount_paid = computed
        if computed <= Decimal("0"):
            bill.payment_status = "unpaid"
        elif computed >= bill.amount_due:
            bill.payment_status = "paid"
        else:
            bill.payment_status = "partial"
        return computed

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    @staticmethod
    def create(db: Session, data: BillCreate, user_id: UUID) -> Bill:
        """Create a new Bill for an order.

        Steps:
          1. Fetch the order (must exist and not be soft-deleted).
          2. Guard against duplicate bills on the same order.
          3. Resolve the bill number (manual or auto-generated).
          4. Persist the Bill record.
          5. Mark the order as dispatched.
          6. Post an income FinancialTransaction and update the party balance.
          7. Write an audit log entry.
          8. Commit and return the refreshed Bill.
        """
        # 1. Fetch order with its party eagerly loaded
        order = (
            db.query(Order)
            .options(joinedload(Order.party))
            .filter(Order.id == data.order_id, Order.is_deleted.is_(False))
            .first()
        )
        if not order:
            raise ValueError("Order not found")

        # 2. Ensure order has no existing active bill
        existing = (
            db.query(Bill)
            .filter(Bill.order_id == data.order_id, Bill.is_deleted.is_(False))
            .first()
        )
        if existing:
            raise ValueError(f"Order already has bill {existing.bill_number}")

        # 3. Resolve bill number — manual takes priority over auto-generation
        if data.bill_number:
            dup = (
                db.query(Bill)
                .filter(Bill.bill_number == data.bill_number, Bill.is_deleted.is_(False))
                .first()
            )
            if dup:
                raise ValueError(f"Bill number {data.bill_number} already exists")
            series, seq = BillService._parse_manual_number(data.bill_number)
            bill_number = data.bill_number
        else:
            bill_number, seq = BillService.next_number(db, data.bill_series)
            series = data.bill_series.upper()

        # 4. Create the Bill record; fall back to order fields for dispatch metadata
        # Capture previous balance before modifying it
        captured_previous_balance = Decimal("0")
        if order.party_id:
            pre_party = db.query(Party).filter(Party.id == order.party_id).first()
            if pre_party:
                captured_previous_balance = Decimal(str(pre_party.balance))

        discount = data.discount if data.discount is not None else Decimal("0")

        bill = Bill(
            bill_number=bill_number,
            bill_series=series,
            bill_sequence=seq,
            order_id=data.order_id,
            party_id=order.party_id,
            bill_date=data.bill_date,
            carrier=data.carrier or order.carrier,
            tracking_number=data.tracking_number or order.tracking_number,
            carton_count=data.carton_count or order.carton_count,
            total_weight=data.total_weight or order.total_weight,
            payment_status="unpaid",
            amount_due=data.amount_due,
            amount_paid=Decimal("0"),
            discount=discount,
            previous_balance=captured_previous_balance,
            notes=data.notes,
            created_by=user_id,
        )
        db.add(bill)
        db.flush()  # obtain bill.id before audit log

        # 5. Mark order as dispatched
        order.status = "dispatched"
        order.dispatch_date = data.bill_date
        order.actual_completion = data.bill_date

        # 6. Post income ledger entry and update party balance
        if order.party_id:
            txn = FinancialTransaction(
                party_id=order.party_id,
                order_id=order.id,
                transaction_type="income",
                amount=data.amount_due,
                reference_number=bill_number,
                description=f"Bill #{bill_number} — {order.goods_description}",
                transaction_date=data.bill_date,
                created_by=user_id,
            )
            db.add(txn)
            db.flush()

            # Lock the party row to prevent concurrent balance corruption
            party = (
                db.query(Party)
                .filter(Party.id == order.party_id)
                .with_for_update()
                .first()
            )
            if party:
                party.balance += data.amount_due

        # 7. Audit log
        AuditService.log_create(
            db,
            "cmt_bills",
            bill.id,
            {"bill_number": bill_number, "amount_due": str(data.amount_due)},
            user_id,
        )

        db.commit()
        db.refresh(bill)
        return bill

    @staticmethod
    def record_payment(db: Session, bill_id: UUID, data: BillPaymentUpdate, user_id: UUID) -> Bill:
        """Record a (partial or full) payment against an existing Bill.

        - Caps the applied amount at the outstanding balance so the bill
          can never be over-paid.
        - Creates a 'payment' FinancialTransaction.
        - Decrements the party balance by the applied amount.
        - Advances payment_status to 'partial' or 'paid' as appropriate.
        """
        bill = (
            db.query(Bill)
            .options(joinedload(Bill.order))
            .filter(Bill.id == bill_id, Bill.is_deleted.is_(False))
            .first()
        )
        if not bill:
            raise ValueError("Bill not found")
        if bill.payment_status == "paid":
            raise ValueError("Bill is already fully paid")

        # Recompute amount_paid from linked transactions before capping
        BillService._recompute_amount_paid(db, bill)

        # Cap payment at the remaining outstanding amount
        outstanding = bill.amount_due - bill.amount_paid
        amount = min(data.amount, outstanding)

        # Post payment transaction to the ledger, linked to this bill
        txn = FinancialTransaction(
            party_id=bill.party_id,
            order_id=bill.order_id,
            bill_id=bill.id,
            transaction_type="payment",
            amount=amount,
            payment_method=data.payment_method,
            reference_number=bill.bill_number,
            description=data.notes or f"Payment for Bill #{bill.bill_number}",
            transaction_date=date_type.today(),
            created_by=user_id,
        )
        db.add(txn)
        db.flush()

        # Decrement party balance (lock row to avoid races)
        if bill.party_id:
            party = (
                db.query(Party)
                .filter(Party.id == bill.party_id)
                .with_for_update()
                .first()
            )
            if party:
                party.balance -= amount

        # Recompute bill totals and status from all linked transactions
        BillService._recompute_amount_paid(db, bill)

        db.commit()
        db.refresh(bill)
        return bill

    # ------------------------------------------------------------------
    # Query operations
    # ------------------------------------------------------------------

    @staticmethod
    def get_all(
        db: Session,
        page: int = 1,
        size: int = 20,
        series: Optional[str] = None,
        party_id: Optional[UUID] = None,
        payment_status: Optional[str] = None,
        date_from: Optional[date_type] = None,
        date_to: Optional[date_type] = None,
        order_id: Optional[UUID] = None,
    ) -> tuple[list[Bill], int]:
        """Return a paginated list of Bills with optional filters.

        Results are ordered newest-first (bill_date desc, then bill_sequence desc).
        Returns a (bills, total_count) tuple for pagination metadata.
        """
        q = (
            db.query(Bill)
            .options(joinedload(Bill.order), joinedload(Bill.party))
            .filter(Bill.is_deleted.is_(False))
        )

        if series:
            q = q.filter(Bill.bill_series == series.upper())
        if party_id:
            q = q.filter(Bill.party_id == party_id)
        if order_id:
            q = q.filter(Bill.order_id == order_id)
        if payment_status:
            q = q.filter(Bill.payment_status == payment_status)
        if date_from:
            q = q.filter(Bill.bill_date >= date_from)
        if date_to:
            q = q.filter(Bill.bill_date <= date_to)

        total = q.count()
        bills = (
            q.order_by(Bill.bill_date.desc(), Bill.bill_sequence.desc())
            .offset((page - 1) * size)
            .limit(size)
            .all()
        )
        return bills, total

    @staticmethod
    def get_by_id(db: Session, bill_id: UUID) -> Optional[Bill]:
        """Fetch a single Bill by primary key with full relationships loaded.

        Loads order items for detail views (e.g. bill PDF generation).
        Returns None if the bill does not exist or is soft-deleted.
        """
        return (
            db.query(Bill)
            .options(
                joinedload(Bill.order).joinedload(Order.items),
                joinedload(Bill.party),
            )
            .filter(Bill.id == bill_id, Bill.is_deleted.is_(False))
            .first()
        )
