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

from app.models.accessories import OrderAccessory
from app.models.bill import Bill
from app.models.inventory import InventoryItem, InventoryTransaction
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
        party_id = None
        order = None

        if data.order_id is not None:
            # --- Order-linked bill ---
            order = (
                db.query(Order)
                .options(joinedload(Order.party))
                .filter(Order.id == data.order_id, Order.is_deleted.is_(False))
                .first()
            )
            if not order:
                raise ValueError("Order not found")

            party_id = order.party_id
        else:
            # --- Standalone bill ---
            party_id = data.party_id
            if not party_id:
                raise ValueError("party_id is required for standalone bills")

        # Resolve bill number
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

        # Capture previous balance
        captured_previous_balance = Decimal("0")
        if party_id:
            pre_party = db.query(Party).filter(Party.id == party_id).first()
            if pre_party:
                captured_previous_balance = Decimal(str(pre_party.balance))

        discount = data.discount if data.discount is not None else Decimal("0")

        bill = Bill(
            bill_number=bill_number,
            bill_series=series,
            bill_sequence=seq,
            order_id=data.order_id,
            party_id=party_id,
            bill_date=data.bill_date,
            carrier=data.carrier or (order.carrier if order else None),
            tracking_number=data.tracking_number or (order.tracking_number if order else None),
            carton_count=data.carton_count or (order.carton_count if order else None),
            total_weight=data.total_weight or (order.total_weight if order else None),
            payment_status="unpaid",
            amount_due=data.amount_due,
            amount_paid=Decimal("0"),
            discount=discount,
            previous_balance=captured_previous_balance,
            notes=data.notes,
            created_by=user_id,
        )
        db.add(bill)
        db.flush()

        # Mark order dispatched on first bill only
        if order and order.status != "dispatched":
            order.status = "dispatched"
            order.dispatch_date = data.bill_date
            order.actual_completion = data.bill_date

        # Post income ledger entry (B-series bills are accessories charges, not generic income)
        if party_id:
            desc = data.description or (
                f"Bill #{bill_number} — {order.goods_description}" if order
                else f"Bill #{bill_number}"
            )
            ledger_type = "accessories" if series == "B" else "income"
            txn = FinancialTransaction(
                party_id=party_id,
                order_id=data.order_id,
                bill_id=bill.id,
                transaction_type=ledger_type,
                amount=data.amount_due,
                reference_number=bill_number,
                description=desc,
                transaction_date=data.bill_date,
                created_by=user_id,
            )
            db.add(txn)
            db.flush()

            party = (
                db.query(Party)
                .filter(Party.id == party_id)
                .with_for_update()
                .first()
            )
            if party:
                party.balance += data.amount_due

        # Return extra accessories to inventory when A-bill is created
        if series == "A" and order:
            BillService._return_accessory_extras(db, order, bill, user_id)

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
    def _return_accessory_extras(db: Session, order: Order, bill: Bill, user_id: UUID) -> None:
        """For each accessory linked to an inventory item, return any extras to stock.

        Extras = accessory.total_qty - order.total_quantity.
        Only runs when an A-bill is created (final stitched qty is then known).
        Skips if extras <= 0 or no inventory_item_id is set.
        """
        accessories = (
            db.query(OrderAccessory)
            .filter(
                OrderAccessory.order_id == order.id,
                OrderAccessory.inventory_item_id.isnot(None),
                OrderAccessory.is_deleted.is_(False),
            )
            .all()
        )
        stitched_qty = Decimal(str(order.total_quantity or 0))
        for acc in accessories:
            extras = Decimal(str(acc.total_qty)) - stitched_qty
            if extras <= Decimal("0"):
                continue
            inv_item = (
                db.query(InventoryItem)
                .filter(InventoryItem.id == acc.inventory_item_id)
                .with_for_update()
                .first()
            )
            if not inv_item:
                continue
            inv_txn = InventoryTransaction(
                item_id=acc.inventory_item_id,
                transaction_type="return",
                quantity=extras,
                unit_cost=acc.unit_price,
                total_cost=extras * Decimal(str(acc.unit_price)),
                reference_type="accessory_extra",
                order_number=order.order_number,
                bill_number=bill.bill_number,
                notes=f"Extra {acc.name} returned from {order.order_number}",
                transaction_date=bill.bill_date,
                created_by=user_id,
            )
            db.add(inv_txn)
            inv_item.current_stock += extras

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
    def delete(db: Session, bill_id: UUID, user_id: UUID) -> None:
        """Soft-delete a bill and reverse its effects.

        - Reverts the order status from dispatched → packing_complete
        - Soft-deletes the income FinancialTransaction created at bill time
        - Decrements the party balance by the income amount
        - Logs an audit entry
        """
        bill = (
            db.query(Bill)
            .options(joinedload(Bill.order))
            .filter(Bill.id == bill_id, Bill.is_deleted.is_(False))
            .first()
        )
        if not bill:
            raise ValueError("Bill not found")

        # Reverse the auto-posted ledger entry (income or accessories for B-series)
        income_txn = (
            db.query(FinancialTransaction)
            .filter(
                FinancialTransaction.bill_id == bill.id,
                FinancialTransaction.transaction_type.in_(["income", "accessories"]),
                FinancialTransaction.is_deleted.is_(False),
            )
            .first()
        )
        if income_txn:
            income_txn.is_deleted = True
            if bill.party_id:
                party = (
                    db.query(Party)
                    .filter(Party.id == bill.party_id)
                    .with_for_update()
                    .first()
                )
                if party:
                    party.balance -= Decimal(str(income_txn.amount))

        # Revert order to packing_complete only if no other active bills remain
        if bill.order:
            other_bills = db.query(Bill).filter(
                Bill.order_id == bill.order_id,
                Bill.id != bill.id,
                Bill.is_deleted.is_(False),
            ).count()
            if other_bills == 0:
                bill.order.status = "packing_complete"
                bill.order.dispatch_date = None
                # Only clear actual_completion if it was set by this bill's dispatch
                if bill.order.actual_completion == bill.bill_date:
                    bill.order.actual_completion = None

        bill.is_deleted = True
        AuditService.log_delete(db, "cmt_bills", bill.id, user_id)
        db.commit()

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
