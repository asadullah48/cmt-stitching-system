"""
One-time migration: split existing A-bills into A (stitching) + B (accessories) + C (packing).

For each A-bill linked to an order:
  - Recalculate stitching amount = stitch_rate_party × total_quantity
  - Extract packing amount    = pack_rate_party × total_quantity  (→ new C-bill)
  - Extract accessories amount = sum(total_qty × unit_price)      (→ new B-bill, only if no B-bill exists)
  - Update A-bill.amount_due to stitching only
  - Update the FinancialTransaction for A-bill accordingly
  - Create new C-bill + FinancialTransaction for packing (if applicable)
  - Create new B-bill + FinancialTransaction for accessories (if applicable and no B-bill yet)
  - Party balance is preserved throughout (net change = 0)

Run:  cd backend && .venv/Scripts/python.exe migrate_split_bills.py
      Add --dry-run to preview without committing.
"""
import sys
import os
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.bill import Bill
from app.models.orders import Order
from app.models.accessories import OrderAccessory
from app.models.financial import FinancialTransaction
from app.models.parties import Party

DRY_RUN = "--dry-run" in sys.argv


def next_bill_number(db, series: str) -> tuple[str, int]:
    """Return (bill_number, sequence) for the next bill in a series."""
    series = series.upper()
    last = (
        db.query(Bill)
        .filter(Bill.bill_series == series, Bill.is_deleted.is_(False))
        .order_by(Bill.bill_sequence.desc())
        .first()
    )
    seq = (last.bill_sequence + 1) if last else 1
    return f"{series}{seq:02d}", seq


def run():
    db = SessionLocal()
    try:
        # Load all non-deleted A-bills that have an order
        a_bills = (
            db.query(Bill)
            .filter(
                Bill.bill_series == "A",
                Bill.is_deleted.is_(False),
                Bill.order_id.isnot(None),
            )
            .all()
        )

        print(f"Found {len(a_bills)} A-bill(s) linked to orders.\n")

        for bill in a_bills:
            order = db.query(Order).filter(Order.id == bill.order_id, Order.is_deleted.is_(False)).first()
            if not order:
                print(f"  SKIP {bill.bill_number} — order not found or deleted")
                continue

            qty = order.total_quantity
            stitch_amt = Decimal(str(order.stitch_rate_party)) * qty
            pack_amt   = Decimal(str(order.pack_rate_party or 0)) * qty

            accessories = db.query(OrderAccessory).filter(
                OrderAccessory.order_id == order.id,
                OrderAccessory.is_deleted.is_(False),
            ).all()
            accessory_amt = sum(
                Decimal(str(a.total_qty)) * Decimal(str(a.unit_price)) for a in accessories
            )

            old_amount = Decimal(str(bill.amount_due))
            new_a_amount = stitch_amt

            # Check for existing B and C bills on this order
            existing_b = db.query(Bill).filter(
                Bill.order_id == order.id,
                Bill.bill_series == "B",
                Bill.is_deleted.is_(False),
            ).first()
            existing_c = db.query(Bill).filter(
                Bill.order_id == order.id,
                Bill.bill_series == "C",
                Bill.is_deleted.is_(False),
            ).first()

            create_b = (not existing_b) and (accessory_amt > 0)
            create_c = (not existing_c) and (pack_amt > 0)

            print(f"  {bill.bill_number}  order={order.order_number}  "
                  f"stitch={stitch_amt}  pack={pack_amt}  accessories={accessory_amt}  "
                  f"old_a={old_amount}  -> new_a={new_a_amount}  "
                  f"create_b={'yes' if create_b else 'no'}  create_c={'yes' if create_c else 'no'}")

            if DRY_RUN:
                continue

            # 1. Update A-bill amount_due
            delta_a = new_a_amount - old_amount  # typically negative
            bill.amount_due = new_a_amount

            # Update A-bill's income FinancialTransaction
            a_txn = db.query(FinancialTransaction).filter(
                FinancialTransaction.bill_id == bill.id,
                FinancialTransaction.transaction_type == "income",
            ).first()
            if a_txn:
                a_txn.amount = new_a_amount

            # Adjust party balance by the reduction on A-bill
            if bill.party_id and delta_a != 0:
                party = db.query(Party).filter(Party.id == bill.party_id).first()
                if party:
                    party.balance += delta_a

            # 2. Create C-bill for packing
            if create_c:
                c_number, c_seq = next_bill_number(db, "C")
                c_bill = Bill(
                    id=uuid.uuid4(),
                    bill_number=c_number,
                    bill_series="C",
                    bill_sequence=c_seq,
                    order_id=order.id,
                    party_id=bill.party_id,
                    bill_date=bill.bill_date,
                    carrier=bill.carrier,
                    tracking_number=bill.tracking_number,
                    carton_count=bill.carton_count,
                    total_weight=bill.total_weight,
                    payment_status="unpaid",
                    amount_due=pack_amt,
                    amount_paid=Decimal("0"),
                    discount=Decimal("0"),
                    previous_balance=Decimal("0"),
                    notes=f"Packing charges (split from {bill.bill_number})",
                    created_by=bill.created_by,
                    is_deleted=False,
                )
                db.add(c_bill)
                db.flush()

                c_txn = FinancialTransaction(
                    id=uuid.uuid4(),
                    party_id=bill.party_id,
                    order_id=order.id,
                    bill_id=c_bill.id,
                    transaction_type="income",
                    amount=pack_amt,
                    reference_number=c_number,
                    description=f"Bill #{c_number} — {order.goods_description} (packing)",
                    transaction_date=bill.bill_date,
                    created_by=bill.created_by,
                )
                db.add(c_txn)

                if bill.party_id:
                    party = db.query(Party).filter(Party.id == bill.party_id).first()
                    if party:
                        party.balance += pack_amt

            # 3. Create B-bill for accessories
            if create_b:
                b_number, b_seq = next_bill_number(db, "B")
                b_bill = Bill(
                    id=uuid.uuid4(),
                    bill_number=b_number,
                    bill_series="B",
                    bill_sequence=b_seq,
                    order_id=order.id,
                    party_id=bill.party_id,
                    bill_date=bill.bill_date,
                    carrier=None,
                    tracking_number=None,
                    carton_count=None,
                    total_weight=None,
                    payment_status="unpaid",
                    amount_due=accessory_amt,
                    amount_paid=Decimal("0"),
                    discount=Decimal("0"),
                    previous_balance=Decimal("0"),
                    notes=f"Accessories (split from {bill.bill_number})",
                    created_by=bill.created_by,
                    is_deleted=False,
                )
                db.add(b_bill)
                db.flush()

                b_txn = FinancialTransaction(
                    id=uuid.uuid4(),
                    party_id=bill.party_id,
                    order_id=order.id,
                    bill_id=b_bill.id,
                    transaction_type="income",
                    amount=accessory_amt,
                    reference_number=b_number,
                    description=f"Bill #{b_number} — {order.goods_description} (accessories)",
                    transaction_date=bill.bill_date,
                    created_by=bill.created_by,
                )
                db.add(b_txn)

                if bill.party_id:
                    party = db.query(Party).filter(Party.id == bill.party_id).first()
                    if party:
                        party.balance += accessory_amt

        if DRY_RUN:
            print("\n[DRY RUN] No changes committed.")
        else:
            db.commit()
            print("\nDone. All changes committed.")

    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
