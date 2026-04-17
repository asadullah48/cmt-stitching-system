# backend/scripts

Operational scripts. Reusable; safe to re-run against new data.

| Script | Purpose |
|--------|---------|
| `import_ledger.py` | Import an Excel ledger into CMT via the live API. Always `--dry-run` first. |

## import_ledger.py

```bash
cd backend
python scripts/import_ledger.py --dry-run     # preview
python scripts/import_ledger.py               # commit
```

> Historical one-off scripts (split-bill migration, cash-account seed, D-series fix) have been removed — they were run once and the results are live in production.
