"""Run once to seed the two default cash accounts."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.overhead import CashAccount

db = SessionLocal()
try:
    existing = db.query(CashAccount).filter(CashAccount.is_deleted == False).count()
    if existing == 0:
        db.add(CashAccount(name="Cash In Hand", account_type="cash", opening_balance=0))
        db.add(CashAccount(name="Bank", account_type="bank", opening_balance=0))
        db.commit()
        print("Seeded: Cash In Hand + Bank accounts")
    else:
        print(f"Skipped: {existing} account(s) already exist")
finally:
    db.close()
