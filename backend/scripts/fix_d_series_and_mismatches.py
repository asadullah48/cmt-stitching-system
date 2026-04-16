"""
fix_d_series_and_mismatches.py

1. Soft-delete existing D-bills + linked txns (reverses balance)
2. Soft-delete raw expense transactions for Shopino's (no balance impact)
3. Create 44 D-series bills from the authoritative Bill tab
4. Fix 5 series mismatches (A19→C19, A25→C25, A28→C28, B24→C24, C22→D45)

Usage:
    python scripts/fix_d_series_and_mismatches.py --dry-run
    python scripts/fix_d_series_and_mismatches.py
"""
import sys
import argparse
from datetime import date
from decimal import Decimal
from uuid import UUID

# Ensure app imports work
sys.path.insert(0, ".")

from app.core.database import SessionLocal
from app.models.bill import Bill
from app.models.financial import FinancialTransaction
from app.models.orders import Order
from app.models.parties import Party

PARTY_NAME = "Shopino's"

# ── D-series bills from the Bill tab (authoritative) ──────────────────────────
# (bill_number, date, description, amount, order_number_or_None)
D_BILLS = [
    ("D01", "2025-09-04", "Net (valika)", 22000, None),
    ("D02", "2025-09-04", "Sample Fabric", 5950, None),
    ("D03", "2025-06-17", "Pattern's bill (tent series)", 10050, "ORD-202604-0005"),
    ("D04", "2025-09-08", "Expense Polybag 4200, Foam Sheet 1570", 7900, None),
    ("D05", "2025-08-29", "Ribbon", 2250, None),
    ("D06", "2025-10-11", "Expense (Thaan received)", 200, None),
    ("D07", "2025-08-29", "Guadrail (for air passes) laundry bag", 4250, None),
    ("D08", "2025-10-11", "Expense Transport (Petrol) Scooty Lot # 1", 2600, None),
    ("D09", "2025-10-11", "Expense Polybag for Bedrail Cloth", 2130, None),
    ("D10", "2025-10-11", "Castel Tent Ribbon accessories", 1200, None),
    ("D11", "2025-10-11", "Expense Transport Rickshaw fare", 700, None),
    ("D12", "2025-11-15", "Expense Transport (Petrol) bedrail Lot # 33", 1200, None),
    ("D13", "2025-12-17", "Castel Tent Ribbon accessories", 2550, None),
    ("D14", "2025-12-18", "Expense Polybag for Bedrail Cloth", 2130, None),
    ("D15", "2025-12-23", "Castel Tent Packing (43 * 80)", 3440, None),
    ("D16", "2025-12-23", "Pattern's (castel, tent house, laundery, car seat)", 15800, "ORD-202604-0017"),
    ("D17", "2026-01-01", "Expense Transport (petrol)", 200, None),
    ("D18", "2026-01-01", "Expense Transport (Rickshaw fare)", 500, None),
    ("D19", "2026-01-01", "Bail Tent House Accessories", 1600, None),
    ("D20", "2026-01-03", "Expense Transport (petrol)", 2000, None),
    ("D21", "2026-01-12", "Garment rack Packing Material", 6150, None),
    ("D22", "2026-01-15", "Expense Transport (Petrol)", 500, None),
    ("D23", "2026-01-15", "Ribbon Accessories, Tent House Lot # 1", 2550, None),
    ("D24", "2026-01-16", "Expense (rubber-band)", 1200, None),
    ("D25", "2026-01-20", "Expense transport (castel delivery)", 1300, None),
    ("D26", "2026-01-25", "Expense transport (petrol)", 500, None),
    ("D27", "2026-01-31", "Material bedrail spring (accessories)", 1200, None),
    ("D28", "2026-02-04", "Expense (bora for packing miscellaneous)", 1300, None),
    ("D29", "2026-02-05", "Expense polybag (Play-area Kit)", 1500, None),
    ("D30", "2026-02-07", "Pattern (Play-area)", 5000, "ORD-202604-0022"),
    ("D31", "2026-02-14", "Expense transport (petrol)", 5500, None),
    ("D32", "2026-03-07", "Expense Polybag for Bedrail Cloth", 750, None),
    ("D33", "2026-03-07", "Play area pipe 3 nalli + vougu accessories", 2500, None),
    ("D34", "2026-03-07", "Ribbon Accessories, Castel Tent Lot # 9", 1360, None),
    ("D35", "2026-03-07", "Expense Transport (Rickshaw fare)", 350, None),
    ("D36", "2026-03-09", "Expense Polybag for Bedrail Cloth", 2400, None),
    ("D37", "2026-03-16", "Expense Transport (Rickshaw)", 350, None),
    ("D38", "2026-03-16", "Expense Polybag for Bedrail Cloth (4.5 * 780)", 3510, None),
    ("D39", "2026-04-06", "Bykea garment rack material delivery", 350, None),
    ("D40", "2026-04-15", "Expense Polybag for Bedrail Cloth (3 * 850)", 2550, None),
    ("D41", "2026-04-15", "Expense Transport (suzuki) adnan/irfan", 2700, None),
    ("D42", "2025-10-18", "Expense Transport (Petrol)", 8000, None),
    ("D43", "2025-10-11", "Expense Castel Handle Dyeing 900 &", 21000, None),
    ("D44", "2026-03-16", "Rent for scooty", 25000, None),
]

# ── Series mismatches to fix ──────────────────────────────────────────────────
# (old_bill_number, new_bill_number, new_series, new_sequence)
SERIES_FIXES = [
    ("A19", "C19", "C", 19),  # Garment rack Packing → packing
    ("A25", "C25", "C", 25),  # Castel tent packing bag → packing
    ("A28", "C28", "C", 28),  # Garment rack Packing → packing
    ("B24", "C24", "C", 24),  # Castel packing → packing
    ("C22", "D45", "D", 45),  # Play area pipe material → misc/expense
]


def resolve_order_id(db, order_number: str) -> UUID:
    order = db.query(Order).filter(
        Order.order_number == order_number,
        Order.is_deleted.is_(False),
    ).first()
    if not order:
        raise ValueError(f"Order {order_number} not found")
    return order.id


def run(dry_run: bool):
    db = SessionLocal()
    party = db.query(Party).filter(Party.name == PARTY_NAME).first()
    if not party:
        print(f"ERROR: Party '{PARTY_NAME}' not found")
        return
    party_id = party.id
    print(f"Party: {party.name} | Balance before: {party.balance}")

    balance_delta = Decimal("0")

    # ── Step 1: Soft-delete existing D-bills ──────────────────────────────────
    print("\n=== STEP 1: Delete existing D-bills ===")
    existing_d = db.query(Bill).filter(
        Bill.party_id == party_id,
        Bill.bill_series == "D",
        Bill.is_deleted.is_(False),
    ).all()
    for b in existing_d:
        # Find and soft-delete linked transaction
        txn = db.query(FinancialTransaction).filter(
            FinancialTransaction.bill_id == b.id,
            FinancialTransaction.is_deleted.is_(False),
        ).first()
        if txn:
            print(f"  Delete txn {txn.transaction_type} {float(txn.amount):>10,.0f} for {b.bill_number}")
            if not dry_run:
                txn.is_deleted = True
            balance_delta -= Decimal(str(txn.amount))
        print(f"  Delete bill {b.bill_number} (amt={float(b.amount_due):>10,.0f})")
        if not dry_run:
            b.is_deleted = True

    # ── Step 2: Soft-delete raw expense transactions ──────────────────────────
    print("\n=== STEP 2: Delete raw expense transactions ===")
    raw_exps = db.query(FinancialTransaction).filter(
        FinancialTransaction.party_id == party_id,
        FinancialTransaction.transaction_type.in_([
            "expense_material", "expense_transport", "expense_misc", "expense",
        ]),
        FinancialTransaction.is_deleted.is_(False),
    ).all()
    total_raw = Decimal("0")
    for t in raw_exps:
        total_raw += Decimal(str(t.amount))
        if not dry_run:
            t.is_deleted = True
    print(f"  Soft-deleted {len(raw_exps)} raw expense txns (total={float(total_raw):>10,.0f})")
    print(f"  (These did NOT affect party balance — no balance change)")

    # ── Step 3: Create 44 D-bills ─────────────────────────────────────────────
    print(f"\n=== STEP 3: Create {len(D_BILLS)} D-bills ===")
    d_total = Decimal("0")
    for bill_num, bill_date_str, desc, amount, order_num in D_BILLS:
        seq = int(bill_num[1:])
        bill_date = date.fromisoformat(bill_date_str)
        order_id = None
        if order_num:
            order_id = resolve_order_id(db, order_num)

        # Check for duplicate bill number
        dup = db.query(Bill).filter(
            Bill.bill_number == bill_num, Bill.is_deleted.is_(False)
        ).first()
        if dup:
            print(f"  SKIP {bill_num} — already exists (id={dup.id})")
            continue

        amt = Decimal(str(amount))
        d_total += amt

        print(f"  Create {bill_num}  {bill_date}  {amt:>10,.0f}  {desc[:50]}")
        if not dry_run:
            bill = Bill(
                bill_number=bill_num,
                bill_series="D",
                bill_sequence=seq,
                order_id=order_id,
                party_id=party_id,
                bill_date=bill_date,
                payment_status="unpaid",
                amount_due=amt,
                amount_paid=Decimal("0"),
                discount=Decimal("0"),
                previous_balance=Decimal("0"),
                notes=desc,
            )
            db.add(bill)
            db.flush()

            # Create misc ledger entry
            txn = FinancialTransaction(
                party_id=party_id,
                order_id=order_id,
                bill_id=bill.id,
                transaction_type="misc",
                amount=amt,
                reference_number=bill_num,
                description=f"Bill #{bill_num} — {desc}",
                transaction_date=bill_date,
            )
            db.add(txn)

        balance_delta += amt

    print(f"  D-bill total: {float(d_total):>12,.0f}")

    # ── Step 4: Fix series mismatches ─────────────────────────────────────────
    print(f"\n=== STEP 4: Fix {len(SERIES_FIXES)} series mismatches ===")
    for old_num, new_num, new_series, new_seq in SERIES_FIXES:
        bill = db.query(Bill).filter(
            Bill.bill_number == old_num, Bill.is_deleted.is_(False)
        ).first()
        if not bill:
            print(f"  SKIP {old_num} → {new_num} — bill not found")
            continue

        # Check new number doesn't already exist
        dup = db.query(Bill).filter(
            Bill.bill_number == new_num, Bill.is_deleted.is_(False)
        ).first()
        if dup:
            print(f"  SKIP {old_num} → {new_num} — target already exists")
            continue

        old_series = bill.bill_series
        print(f"  {old_num} -> {new_num}  (series {old_series}->{new_series}, amt={float(bill.amount_due):>10,.0f})")

        if not dry_run:
            bill.bill_number = new_num
            bill.bill_series = new_series
            bill.bill_sequence = new_seq

            # Update linked transaction type
            # Old type mapping: A→income, B→accessories, C→packing
            # New type mapping: C→packing, D→misc
            new_txn_type = "packing" if new_series == "C" else "misc"
            txn = db.query(FinancialTransaction).filter(
                FinancialTransaction.bill_id == bill.id,
                FinancialTransaction.is_deleted.is_(False),
            ).first()
            if txn:
                old_txn_type = txn.transaction_type
                txn.transaction_type = new_txn_type
                txn.reference_number = new_num
                txn.description = txn.description.replace(old_num, new_num) if txn.description else f"Bill #{new_num}"
                print(f"    txn type: {old_txn_type} -> {new_txn_type}")

    # ── Step 5: Update party balance ──────────────────────────────────────────
    print(f"\n=== STEP 5: Balance adjustment ===")
    print(f"  Balance before:  {float(party.balance):>12,.0f}")
    print(f"  Balance delta:   {float(balance_delta):>+12,.0f}")
    new_balance = party.balance + balance_delta
    print(f"  Balance after:   {float(new_balance):>12,.0f}")

    if not dry_run:
        party.balance = new_balance
        db.commit()
        print("\nAll changes committed.")
    else:
        db.rollback()
        print("\n[DRY RUN] No changes made.")

    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
