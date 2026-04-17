"""
allocation_service.py — Read-only FIFO allocation of party payments against bills.

Computes, per party:
  - Per-bill explicit_paid (payments linked to that bill) + advance_applied (FIFO sweep)
    of unlinked payments → effective_paid and effective_status.
  - Party-level advance_balance (unallocated payments after all bills satisfied).

Does NOT mutate any DB rows. Ledger transactions stay untouched.
"""

from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.financial import FinancialTransaction
from app.models.parties import Party


ZERO = Decimal("0")


class AllocationService:

    @staticmethod
    def compute(db: Session, party_id: UUID) -> dict:
        party = (
            db.query(Party)
            .filter(Party.id == party_id, Party.is_deleted.is_(False))
            .first()
        )
        if not party:
            raise ValueError("Party not found")

        bills = (
            db.query(Bill)
            .filter(Bill.party_id == party_id, Bill.is_deleted.is_(False))
            .order_by(Bill.bill_date.asc(), Bill.bill_sequence.asc())
            .all()
        )

        payments = (
            db.query(FinancialTransaction)
            .filter(
                FinancialTransaction.party_id == party_id,
                FinancialTransaction.transaction_type == "payment",
                FinancialTransaction.is_deleted.is_(False),
            )
            .order_by(
                FinancialTransaction.transaction_date.asc(),
                FinancialTransaction.created_at.asc(),
            )
            .all()
        )

        bill_ids = {b.id for b in bills}
        explicit: dict[UUID, Decimal] = {b.id: ZERO for b in bills}
        unallocated_total = ZERO

        for p in payments:
            amt = Decimal(str(p.amount))
            if p.bill_id is not None and p.bill_id in bill_ids:
                explicit[p.bill_id] += amt
            else:
                unallocated_total += amt

        # Normalise: if a bill's explicit-linked payments exceed its face value,
        # the excess is a real advance — push it into the FIFO pool.
        for b in bills:
            due = Decimal(str(b.amount_due))
            ex = explicit[b.id]
            if ex > due:
                unallocated_total += ex - due
                explicit[b.id] = due

        items: list[dict] = []
        for b in bills:
            due = Decimal(str(b.amount_due))
            ex = explicit[b.id]
            remaining_need = max(due - ex, ZERO)
            advance_applied = min(remaining_need, unallocated_total)
            if advance_applied < ZERO:
                advance_applied = ZERO
            unallocated_total -= advance_applied

            effective_paid = ex + advance_applied
            outstanding = max(due - effective_paid, ZERO)
            if effective_paid <= ZERO:
                status = "unpaid"
            elif effective_paid >= due:
                status = "paid"
            else:
                status = "partial"

            items.append({
                "bill_id": b.id,
                "bill_number": b.bill_number,
                "bill_series": b.bill_series,
                "bill_date": b.bill_date,
                "amount_due": due,
                "explicit_paid": ex,
                "advance_applied": advance_applied,
                "effective_paid": effective_paid,
                "outstanding": outstanding,
                "effective_status": status,
            })

        total_billed = sum((Decimal(str(b.amount_due)) for b in bills), ZERO)
        total_paid = sum((Decimal(str(p.amount)) for p in payments), ZERO)
        total_outstanding = sum((i["outstanding"] for i in items), ZERO)
        advance_balance = unallocated_total  # leftover after sweep

        return {
            "party_id": party.id,
            "party_name": party.name,
            "total_billed": total_billed,
            "total_paid": total_paid,
            "total_outstanding": total_outstanding,
            "advance_balance": advance_balance,
            "bills": items,
        }

    @staticmethod
    def reconcile(db: Session, party_id: UUID, commit: bool = True) -> dict:
        """Persist FIFO allocation results back to each Bill row.

        Writes `effective_paid` → `bill.amount_paid` and `effective_status`
        → `bill.payment_status` so the Bills list reflects advance sweeps.

        Does NOT mutate ledger transactions or party.balance.
        Safe to call repeatedly — idempotent against current payment data.
        """
        result = AllocationService.compute(db, party_id)
        bill_ids = [info["bill_id"] for info in result["bills"]]
        if not bill_ids:
            return result

        bill_map = {
            b.id: b
            for b in db.query(Bill).filter(Bill.id.in_(bill_ids)).all()
        }
        for info in result["bills"]:
            bill = bill_map.get(info["bill_id"])
            if not bill:
                continue
            bill.amount_paid = info["effective_paid"]
            bill.payment_status = info["effective_status"]

        if commit:
            db.commit()
        else:
            db.flush()
        return result
