# backend/scripts

One-time and operational scripts. Do not run unless you know the script is idempotent or has not yet been applied.

| Script | Purpose | Status |
|--------|---------|--------|
| `import_ledger.py` | Import Excel ledger data into CMT (runs against live API). Use `--dry-run` first. | Reusable — run against new data batches |
| `migrate_split_bills.py` | Split existing A-bills into A (stitching) + B (accessories) + C (packing) | Already ran — do not run again |
| `seed_cash_accounts.py` | Seed the two default cash accounts (Cash In Hand + Bank) | Already ran — do not run again |

## Running import_ledger.py

```bash
cd backend
# Dry run first — shows what will be created/skipped
python scripts/import_ledger.py --dry-run

# Live run
python scripts/import_ledger.py
```
