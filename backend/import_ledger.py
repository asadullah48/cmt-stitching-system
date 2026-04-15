#!/usr/bin/env python3
"""
One-time import script: sync Excel ledger data into CMT stitching system.

Usage:
    python import_ledger.py [--base-url URL] [--username USER] [--password PASS]

Defaults:
    base-url : http://localhost:8000/api/v1
    username : ADMIN_USERNAME env var  (fallback: admin)
    password : ADMIN_PASSWORD env var  (fallback: interactive prompt)

Run from backend dir:
    cd backend && .venv/Scripts/python.exe import_ledger.py
"""

import argparse
import getpass
import os
import sys

import requests


# -----------------------------------------------------------------------------
# LEDGER DATA — transcribed from Excel (Feb 2025 -> Apr 2026, Shopino's only)
# -----------------------------------------------------------------------------

LEDGER_DATA = [
    {
        "seq": 1,
        "goods_description": "Bedrail Lot # 19, 20 & 21",
        "total_quantity": 1023,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 19,
        "entry_date": "2025-02-10",
        "bills": [
            {"number": "A01", "series": "A", "date": "2025-02-10", "amount": 138105},
            {"number": "B01", "series": "B", "date": "2025-02-10", "amount": 35000},
        ],
        "payments": [
            {"date": "2025-02-10", "amount": 35000, "bill": "B01", "ref": "STAN-345436-B01",  "method": "bank_transfer"},
            {"date": "2025-02-28", "amount": 50000, "bill": "A01", "ref": "STAN-673895-A01",  "method": "bank_transfer"},
            {"date": "2025-03-01", "amount": 50000, "bill": "A01", "ref": "STAN-843583-A01",  "method": "bank_transfer"},
            {"date": "2025-03-10", "amount": 38105, "bill": "A01", "ref": "STAN-904611-A01",  "method": "bank_transfer"},
        ],
    },
    {
        "seq": 2,
        "goods_description": "Bedrail Lot # 22 & 23",
        "total_quantity": 600,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 22,
        "entry_date": "2025-04-09",
        "bills": [
            {"number": "B02", "series": "B", "date": "2025-04-09", "amount": 20400},
            {"number": "A02", "series": "A", "date": "2025-04-24", "amount": 81000},
        ],
        "payments": [
            {"date": "2025-04-09", "amount": 20400, "bill": "B02", "ref": "STAN-518115-B02",  "method": "bank_transfer"},
            {"date": "2025-04-25", "amount": 50000, "bill": "A02", "ref": "STAN-737028-A02",  "method": "bank_transfer"},
            {"date": "2025-04-29", "amount": 31000, "bill": "A02", "ref": "STAN-462571-A02",  "method": "bank_transfer"},
        ],
    },
    {
        "seq": 3,
        "goods_description": "Bedrail Lot # 24",
        "total_quantity": 436,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 24,
        "entry_date": "2025-06-05",
        "bills": [
            {"number": "B03", "series": "B", "date": "2025-06-05", "amount": 15000},
            {"number": "A03", "series": "A", "date": "2025-06-05", "amount": 58860},
        ],
        "payments": [
            {"date": "2025-06-05", "amount": 15000, "bill": "B03", "ref": "STAN-956309-B03",  "method": "bank_transfer"},
            {"date": "2025-06-03", "amount":  5000, "bill": "A03", "ref": "STAN-126682-A03",  "method": "bank_transfer"},
            {"date": "2025-06-05", "amount": 50000, "bill": "A03", "ref": "STAN-145939-A03",  "method": "bank_transfer"},
        ],
    },
    {
        "seq": 4,
        "goods_description": "R&D Pattern (tent series)",
        "total_quantity": 1,
        "stitch_rate_party": 0,
        "pack_rate_party": None,
        "lot_number": None,
        "entry_date": "2025-06-17",
        "bills": [
            {"number": "D01", "series": "D", "date": "2025-06-17", "amount": 8100},
        ],
        "payments": [
            {"date": "2025-06-17", "amount": 8100, "bill": "D01", "ref": "STAN-570483-D01", "method": "bank_transfer"},
        ],
    },
    {
        "seq": 5,
        "goods_description": "Bedrail Lot # 25",
        "total_quantity": 303,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 25,
        "entry_date": "2025-06-17",
        "bills": [
            {"number": "B04", "series": "B", "date": "2025-06-17", "amount": 11900},
            {"number": "A04", "series": "A", "date": "2025-06-28", "amount": 40905},
        ],
        "payments": [
            {"date": "2025-06-17", "amount": 11900, "bill": "B04", "ref": "STAN-570483-B04", "method": "bank_transfer"},
            {"date": "2025-06-28", "amount": 40000, "bill": "A04", "ref": "STAN-910045-A04", "method": "bank_transfer"},
        ],
    },
    {
        "seq": 6,
        "goods_description": "Bedrail Lot # 26 & 27",
        "total_quantity": 620,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 26,
        "entry_date": "2025-07-26",
        "bills": [
            {"number": "B05", "series": "B", "date": "2025-07-26", "amount": 23800},
            {"number": "A05", "series": "A", "date": "2025-08-02", "amount": 83700},
        ],
        "payments": [
            {"date": "2025-07-26", "amount": 23800, "bill": "B05", "ref": "STAN-744261-B05", "method": "bank_transfer"},
            {"date": "2025-08-02", "amount": 50000, "bill": "A05", "ref": "STAN-153731-A05", "method": "bank_transfer"},
            {"date": "2025-08-09", "amount": 35000, "bill": "A05", "ref": "STAN-112754-A05", "method": "bank_transfer"},
        ],
    },
    {
        "seq": 7,
        "goods_description": "Castel Tent Lot # 1",
        "total_quantity": 89,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 1,
        "entry_date": "2025-08-29",
        "bills": [
            {"number": "A06", "series": "A", "date": "2025-08-29", "amount": 32040},
            {"number": "B06", "series": "B", "date": "2025-09-23", "amount": 5340},
        ],
        "payments": [],  # 70,000 multi-bill payment (A06+A07) -> STANDALONE_PAYMENTS
    },
    {
        "seq": 8,
        "goods_description": "Bedrail Lot # 28",
        "total_quantity": 289,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 28,
        "entry_date": "2025-08-29",
        "bills": [
            {"number": "A07", "series": "A", "date": "2025-08-29", "amount": 39015},
            {"number": "B07", "series": "B", "date": "2025-08-29", "amount": 10200},
        ],
        "payments": [
            {"date": "2025-09-03", "amount": 10000, "bill": "B07", "ref": "STAN-915864-B07", "method": "bank_transfer"},
        ],
    },
    {
        "seq": 9,
        "goods_description": "Bedrail Lot # 29",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 29,
        "entry_date": "2025-09-23",
        "bills": [
            {"number": "A08", "series": "A", "date": "2025-09-23", "amount": 40500},
            {"number": "B08", "series": "B", "date": "2025-09-23", "amount": 10200},
            {"number": "C08", "series": "C", "date": "2025-10-10", "amount": 24000},
        ],
        "payments": [
            # 50,000 multi-bill payment (A08+B08) -> STANDALONE_PAYMENTS
            {"date": "2025-10-11", "amount": 20000, "bill": "C08", "ref": "STAN-921318-C08", "method": "bank_transfer"},
        ],
    },
    {
        "seq": 10,
        "goods_description": "Bedrail Lot # 30",
        "total_quantity": 252,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 30,
        "entry_date": "2025-10-18",
        "bills": [
            {"number": "A09", "series": "A", "date": "2025-10-18", "amount": 34020},
            {"number": "B09", "series": "B", "date": "2025-10-18", "amount": 10200},
            {"number": "C09", "series": "C", "date": "2025-10-27", "amount": 24000},  # date fixed: was 27/10/2026
        ],
        "payments": [],
    },
    {
        "seq": 11,
        "goods_description": "Bedrail Lot # 31",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 31,
        "entry_date": "2025-10-22",
        "bills": [
            {"number": "A10", "series": "A", "date": "2025-10-22", "amount": 40500},
            {"number": "B10", "series": "B", "date": "2025-10-22", "amount": 10200},
            {"number": "C10", "series": "C", "date": "2025-11-19", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 12,
        "goods_description": "Bedrail Lot # 32",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 32,
        "entry_date": "2025-11-10",
        "bills": [
            {"number": "A11", "series": "A", "date": "2025-11-10", "amount": 40500},
            {"number": "B11", "series": "B", "date": "2025-11-10", "amount": 10200},
            {"number": "C11", "series": "C", "date": "2025-12-03", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 13,
        "goods_description": "Castel Tent Lot # 2",
        "total_quantity": 88,
        "stitch_rate_party": 360,
        "pack_rate_party": 30,
        "lot_number": 2,
        "entry_date": "2025-11-10",
        "bills": [
            {"number": "A12", "series": "A", "date": "2025-11-10", "amount": 31680},
            {"number": "B12", "series": "B", "date": "2025-11-10", "amount": 10500},
            {"number": "C12", "series": "C", "date": "2025-12-23", "amount": 2550},
        ],
        "payments": [],
    },
    {
        "seq": 14,
        "goods_description": "Bedrail Lot # 33",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 33,
        "entry_date": "2025-11-11",
        "bills": [
            {"number": "A13", "series": "A", "date": "2025-11-11", "amount": 40500},
            {"number": "B13", "series": "B", "date": "2025-11-11", "amount": 10200},
            {"number": "C13", "series": "C", "date": "2026-01-06", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 15,
        "goods_description": "Castel Tent Lot # 3 & 4",
        "total_quantity": 170,
        "stitch_rate_party": 360,
        "pack_rate_party": 30,
        "lot_number": 3,
        "entry_date": "2025-12-17",
        "bills": [
            {"number": "A14", "series": "A", "date": "2025-12-17", "amount": 61200},
            {"number": "C14", "series": "C", "date": "2026-02-16", "amount": 5100},
        ],
        "payments": [],
    },
    {
        "seq": 16,
        "goods_description": "Bedrail Lot # 34",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 34,
        "entry_date": "2025-12-18",
        "bills": [
            {"number": "A15", "series": "A", "date": "2025-12-18", "amount": 40500},
            {"number": "B15", "series": "B", "date": "2025-12-18", "amount": 10200},
            {"number": "C15", "series": "C", "date": "2026-03-04", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 17,
        "goods_description": "R&D Pattern (castel, tent house, laundry, car seat)",
        "total_quantity": 1,
        "stitch_rate_party": 0,
        "pack_rate_party": None,
        "lot_number": None,
        "entry_date": "2025-12-23",
        "bills": [
            {"number": "D16", "series": "D", "date": "2025-12-23", "amount": 15800},
        ],
        "payments": [],
    },
    {
        "seq": 18,
        "goods_description": "Tent House Lot # 1 (blue)",
        "total_quantity": 33,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 1,
        "entry_date": "2026-01-01",
        "bills": [
            {"number": "A16", "series": "A", "date": "2026-01-01", "amount": 12130},
            {"number": "B16", "series": "B", "date": "2026-01-01", "amount": 5861},
            {"number": "C16", "series": "C", "date": "2026-01-16", "amount": 3580},
        ],
        "payments": [],
    },
    {
        "seq": 19,
        "goods_description": "Laundry Bag Lot # 1",
        "total_quantity": 1,
        "stitch_rate_party": 16000,
        "pack_rate_party": None,
        "lot_number": 1,
        "entry_date": "2026-01-01",
        "bills": [
            {"number": "B17", "series": "B", "date": "2026-01-01", "amount": 22500},
            {"number": "A17", "series": "A", "date": "2026-01-04", "amount": 16000},
        ],
        "payments": [],
    },
    {
        "seq": 20,
        "goods_description": "Bedrail Lot # 35",
        "total_quantity": 600,  # 81000 / 135 = 600
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 35,
        "entry_date": "2026-01-09",
        "bills": [
            {"number": "A18", "series": "A", "date": "2026-01-09", "amount": 81000},
            # Excel row has no bill number assigned; assigning B18
            {"number": "B18", "series": "B", "date": "2026-01-09", "amount": 20400},
            {"number": "C18", "series": "C", "date": "2026-03-16", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 21,
        "goods_description": "Garment Rack",
        "total_quantity": 1,
        "stitch_rate_party": 5000,
        "pack_rate_party": None,
        "lot_number": None,
        "entry_date": "2026-01-14",
        "bills": [
            {"number": "A19", "series": "A", "date": "2026-01-14", "amount": 5000},
        ],
        "payments": [],
    },
    {
        "seq": 22,
        "goods_description": "Castel Tent Lot # 5 & 6",
        "total_quantity": 130,
        "stitch_rate_party": 360,
        "pack_rate_party": 30,
        "lot_number": 5,
        "entry_date": "2026-02-11",
        "bills": [
            {"number": "A20", "series": "A", "date": "2026-02-11", "amount": 46800},
            {"number": "C20", "series": "C", "date": "2026-02-16", "amount": 3900},
            {"number": "D30", "series": "D", "date": "2026-02-07", "amount": 5000},
        ],
        "payments": [],
    },
    {
        "seq": 23,
        "goods_description": "Castel Tent Lot # 7 & 8",
        "total_quantity": 170,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 7,
        "entry_date": "2026-02-16",
        "bills": [
            {"number": "A21", "series": "A", "date": "2026-02-16", "amount": 61200},
        ],
        "payments": [],
    },
    {
        "seq": 24,
        "goods_description": "Play-Area Lot # 1",
        "total_quantity": 1,
        "stitch_rate_party": 32000,
        "pack_rate_party": None,
        "lot_number": 1,
        "entry_date": "2026-03-01",
        "bills": [
            {"number": "A22", "series": "A", "date": "2026-03-01", "amount": 32000},
            {"number": "B22", "series": "B", "date": "2026-03-01", "amount": 7400},
            {"number": "C22", "series": "C", "date": "2026-03-07", "amount": 2400},
        ],
        "payments": [],
    },
    {
        "seq": 25,
        "goods_description": "Tent House Lot # 2",
        "total_quantity": 99,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 2,
        "entry_date": "2026-03-06",
        "bills": [
            {"number": "A23", "series": "A", "date": "2026-03-06", "amount": 35640},
        ],
        "payments": [],
    },
    {
        "seq": 26,
        "goods_description": "Castel Tent Lot # 9",
        "total_quantity": 85,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 9,
        "entry_date": "2026-03-07",
        "bills": [
            {"number": "A24", "series": "A", "date": "2026-03-07", "amount": 30600},
            {"number": "B24", "series": "B", "date": "2026-03-07", "amount": 2550},
            # B24 duplicated in Excel on 8/4/2026 — created once here, duplicate skipped
        ],
        "payments": [],
    },
    {
        "seq": 27,
        "goods_description": "Castel Tent packing bag (426 pcs)",
        "total_quantity": 426,
        "stitch_rate_party": 50,
        "pack_rate_party": None,
        "lot_number": None,
        "entry_date": "2026-03-07",
        "bills": [
            {"number": "A25", "series": "A", "date": "2026-03-07", "amount": 21300},
        ],
        "payments": [],
    },
    {
        "seq": 28,
        "goods_description": "Bedrail Lot # 36",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 36,
        "entry_date": "2026-03-07",
        "bills": [
            {"number": "A26", "series": "A", "date": "2026-03-07", "amount": 40500},
            {"number": "B26", "series": "B", "date": "2026-03-07", "amount": 10200},
        ],
        "payments": [],
    },
    {
        "seq": 29,
        "goods_description": "Bedrail Lot # 37 (Central Plaza)",
        "total_quantity": 150,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": None,  # Central Plaza sub-delivery; lot 37 belongs to ORD-0032
        "entry_date": "2026-03-16",
        "bills": [
            {"number": "A27", "series": "A", "date": "2026-03-16", "amount": 20250},
            {"number": "B27", "series": "B", "date": "2026-03-16", "amount": 5100},
        ],
        "payments": [],
    },
    {
        "seq": 30,
        "goods_description": "Garment Rack (batch 2)",
        "total_quantity": 1,
        "stitch_rate_party": 5000,
        "pack_rate_party": None,
        "lot_number": None,
        "entry_date": "2026-04-08",
        "bills": [
            {"number": "A28", "series": "A", "date": "2026-04-08", "amount": 5000},
        ],
        "payments": [],
    },
    {
        "seq": 31,
        "goods_description": "Castel Tent Lot # 10",
        "total_quantity": 85,
        "stitch_rate_party": 360,
        "pack_rate_party": None,
        "lot_number": 10,
        "entry_date": "2026-04-08",
        "bills": [
            {"number": "A29", "series": "A", "date": "2026-04-08", "amount": 30600},
        ],
        "payments": [],
    },
    {
        "seq": 32,
        "goods_description": "Bedrail Lot # 37",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": 80,
        "lot_number": 37,
        "entry_date": "2026-04-15",
        "bills": [
            {"number": "A30", "series": "A", "date": "2026-04-15", "amount": 40500},
            {"number": "B30", "series": "B", "date": "2026-04-15", "amount": 10200},
            {"number": "C30", "series": "C", "date": "2026-04-20", "amount": 24000},
        ],
        "payments": [],
    },
    {
        "seq": 33,
        "goods_description": "Castel Tent Lot # 11",
        "total_quantity": 129,
        "stitch_rate_party": 360,
        "pack_rate_party": 30,
        "lot_number": 11,
        "entry_date": "2026-04-17",
        "bills": [
            {"number": "A31", "series": "A", "date": "2026-04-17", "amount": 46440},
            {"number": "C31", "series": "C", "date": "2026-04-17", "amount": 3870},
        ],
        "payments": [],
    },
    {
        "seq": 34,
        "goods_description": "Bedrail Lot # 38",
        "total_quantity": 300,
        "stitch_rate_party": 135,
        "pack_rate_party": None,
        "lot_number": 38,
        "entry_date": "2026-04-20",
        "bills": [
            {"number": "A32", "series": "A", "date": "2026-04-20", "amount": 40500},
            {"number": "B32", "series": "B", "date": "2026-04-20", "amount": 10200},
        ],
        "payments": [],
    },
]

# Payments that span multiple bills — applied to party balance only (no bill_id link)
STANDALONE_PAYMENTS = [
    # Advance / goodwill (no bill ref)
    {"date": "2025-04-05", "amount": 25000, "ref": "GOODWILL-20250405",
     "method": "bank_transfer", "desc": "GOOD-WILL (dasti)"},
    # 70,000 bank transfer covering both A06 and A07
    {"date": "2025-08-29", "amount": 70000, "ref": "STAN-121230-MULTI",
     "method": "bank_transfer", "desc": "Payment for A06 & A07 (ORD-0007 & ORD-0008)"},
    # 50,000 bank transfer covering A08 + B08
    {"date": "2025-09-29", "amount": 50000, "ref": "STAN-544460-MULTI",
     "method": "bank_transfer", "desc": "Payment for A08 & B08 (ORD-0009)"},
    # Easypaisa (no bill ref)
    {"date": "2026-03-07", "amount": 20000, "ref": "EASYPAISA-20260307",
     "method": "easypaisa", "desc": "Easypaisa transfer"},
    # April 2026 payments — no specific bill reference in ledger
    {"date": "2026-04-04", "amount": 35000, "ref": "STAN-771291",
     "method": "bank_transfer", "desc": "Payment — Abdul Samad XXXX1241"},
    {"date": "2026-04-10", "amount": 50000, "ref": "STAN-776357",
     "method": "bank_transfer", "desc": "Payment — Shoppers Pakistan A/C 0126"},
    {"date": "2026-04-13", "amount": 15000, "ref": "STAN-955115",
     "method": "bank_transfer", "desc": "Payment — Shoppers Pakistan A/C 0126"},
]

# D-bills with NO order reference -> expense transactions
EXPENSE_TRANSACTIONS = [
    # Anomaly rows with no proper bill number
    {"ref": "EXP-090825",   "date": "2025-08-09", "amount": 5770,  "desc": "Expense Polybag 4200, Foam Sheet 1570"},
    {"ref": "EXP-101125B",  "date": "2025-11-10", "amount": 2100,  "desc": "Castel Tent Packing Bag Lot # 1 (89x60)"},
    # D-series expense bills
    {"ref": "D02", "date": "2025-10-11", "amount": 1950,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D03", "date": "2025-10-18", "amount": 1950,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D04", "date": "2025-10-22", "amount": 2130,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D05", "date": "2025-10-22", "amount": 1050,  "desc": "Expense Polybag Bedrail kit"},
    {"ref": "D06", "date": "2025-11-10", "amount": 200,   "desc": "Expense (Thaan received)"},
    {"ref": "D07", "date": "2025-11-10", "amount": 3500,  "desc": "Expense Transport (Petrol) bedrail Lot # 31"},
    {"ref": "D08", "date": "2025-11-10", "amount": 2600,  "desc": "Expense Transport (Petrol) Scooty Lot # 1"},
    {"ref": "D09", "date": "2025-11-10", "amount": 2130,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D10", "date": "2025-11-10", "amount": 1200,  "desc": "Castel Tent Ribbon accessories"},
    {"ref": "D11", "date": "2025-11-10", "amount": 700,   "desc": "Expense Transport Rickshaw fare"},
    {"ref": "D12", "date": "2025-11-15", "amount": 1200,  "desc": "Expense Transport (Petrol) bedrail Lot # 33"},
    {"ref": "D13", "date": "2025-12-17", "amount": 2550,  "desc": "Castel Tent Ribbon accessories"},
    {"ref": "D14", "date": "2025-12-18", "amount": 2130,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D15", "date": "2025-12-23", "amount": 3440,  "desc": "Castel Tent Packing (43 x 80)"},
    {"ref": "D17", "date": "2026-01-01", "amount": 200,   "desc": "Expense Transport (petrol)"},
    {"ref": "D18", "date": "2026-01-01", "amount": 500,   "desc": "Expense Transport (Rickshaw fare)"},
    {"ref": "D19", "date": "2026-01-01", "amount": 1600,  "desc": "Bail Tent House Accessories"},
    {"ref": "D20", "date": "2026-01-03", "amount": 2000,  "desc": "Expense Transport (petrol)"},
    {"ref": "D21", "date": "2026-01-12", "amount": 6150,  "desc": "Garment Rack Packing Material"},
    {"ref": "D22", "date": "2026-01-15", "amount": 500,   "desc": "Expense Transport (Petrol)"},
    {"ref": "D23", "date": "2026-01-15", "amount": 2550,  "desc": "Ribbon Accessories, Tent House Lot # 1"},
    {"ref": "D24", "date": "2026-01-16", "amount": 1200,  "desc": "Expense (rubber-band)"},
    {"ref": "D25", "date": "2026-01-20", "amount": 1300,  "desc": "Expense transport (castel delivery)"},
    {"ref": "D26", "date": "2026-01-25", "amount": 500,   "desc": "Expense transport (petrol)"},
    {"ref": "D27", "date": "2026-01-31", "amount": 1200,  "desc": "Material bedrail spring (accessories)"},
    {"ref": "D28", "date": "2026-02-04", "amount": 1300,  "desc": "Expense (bora for packing miscellaneous)"},
    {"ref": "D29", "date": "2026-02-05", "amount": 1500,  "desc": "Expense polybag (Play-area Kit)"},
    {"ref": "D31", "date": "2026-02-14", "amount": 5500,  "desc": "Expense transport (petrol)"},
    {"ref": "D32", "date": "2026-03-07", "amount": 750,   "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D33", "date": "2026-03-07", "amount": 2500,  "desc": "Play area pipe 3 nalli + vougu accessories"},
    {"ref": "D34", "date": "2026-03-07", "amount": 1360,  "desc": "Ribbon Accessories, Castel Tent Lot # 9"},
    {"ref": "D35", "date": "2026-03-07", "amount": 350,   "desc": "Expense Transport (Rickshaw fare)"},
    {"ref": "D36", "date": "2026-03-09", "amount": 2400,  "desc": "Expense Polybag for Bedrail Cloth"},
    {"ref": "D37", "date": "2026-03-16", "amount": 350,   "desc": "Expense Transport (Rickshaw)"},
    {"ref": "D38", "date": "2026-03-16", "amount": 3510,  "desc": "Expense Polybag for Bedrail Cloth (4.5 x 780)"},
    {"ref": "Rent-20260316", "date": "2026-03-16", "amount": 25000, "desc": "Rent for scooty"},
    {"ref": "D39", "date": "2026-04-06", "amount": 350,   "desc": "Bykea garment rack material delivery"},
    {"ref": "D40", "date": "2026-04-15", "amount": 2550,  "desc": "Expense Polybag for Bedrail Cloth (3 x 850)"},
]


# -----------------------------------------------------------------------------
# SCRIPT
# -----------------------------------------------------------------------------

def paginated_get(s, url, params=None):
    """Fetch all pages and return flat list of items from 'data' key."""
    params = dict(params or {})
    params.setdefault("size", 100)
    params["page"] = 1
    items = []
    while True:
        r = s.get(url, params=params)
        r.raise_for_status()
        body = r.json()
        page_items = body.get("data", [])
        items.extend(page_items)
        if len(items) >= body.get("total", 0):
            break
        params["page"] += 1
    return items


def main():
    parser = argparse.ArgumentParser(description="Import Excel ledger into CMT system")
    parser.add_argument("--base-url", default="http://localhost:8000/api/v1")
    parser.add_argument("--username", default=os.getenv("ADMIN_USERNAME", "admin"))
    parser.add_argument("--password", default=os.getenv("ADMIN_PASSWORD", ""))
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be created without calling the API")
    args = parser.parse_args()

    if not args.password and not args.dry_run:
        args.password = getpass.getpass("Admin password: ")

    base = args.base_url.rstrip("/")
    s = requests.Session()

    # -- Step 0: Authenticate --------------------------------------------------
    if not args.dry_run:
        print("Authenticating...")
        r = s.post(f"{base}/auth/login",
                   json={"username": args.username, "password": args.password})
        if not r.ok:
            print(f"  ERROR: {r.status_code} {r.text}")
            sys.exit(1)
        s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
        print("  OK OK")
    else:
        print("[DRY RUN] Skipping auth")

    # -- Step 1: Find Shopino's party -----------------------------------------
    print("\nFinding Shopino's party...")
    if args.dry_run:
        party_id = "DRY-RUN-PARTY-ID"
        print(f"  [DRY RUN] party_id={party_id}")
    else:
        parties = paginated_get(s, f"{base}/parties/")
        shopinos = next(
            (p for p in parties if p["name"].lower().startswith("shopino")), None
        )
        if not shopinos:
            print("  ERROR: 'Shopino' party not found. Create it in the app first.")
            sys.exit(1)
        party_id = shopinos["id"]
        print(f"  OK {shopinos['name']}  id={party_id}  balance={shopinos['balance']}")

    # -- Step 2: Snapshot existing state --------------------------------------
    print("\nSnapshotting existing data...")
    if args.dry_run:
        existing_orders, existing_bills, existing_refs = {}, {}, set()
    else:
        raw_orders = paginated_get(s, f"{base}/orders/", {"party_id": party_id})
        existing_orders = {o["order_number"]: o["id"] for o in raw_orders}

        raw_bills = paginated_get(s, f"{base}/bills/", {"party_id": party_id})
        existing_bills = {b["bill_number"]: b["id"] for b in raw_bills}

        raw_txns = paginated_get(s, f"{base}/transactions/", {"party_id": party_id})
        existing_refs = {
            t["reference_number"] for t in raw_txns if t.get("reference_number")
        }

    max_seq = max(
        (int(n.split("-")[-1]) for n in existing_orders if n.startswith("ORD-")),
        default=0,
    )
    print(f"  Orders: {len(existing_orders)} existing (max seq={max_seq})")
    print(f"  Bills:  {len(existing_bills)} existing")
    print(f"  Txns:   {len(existing_refs)} with reference numbers")

    # -- Validate sequence before writing anything -----------------------------
    needed_seqs = {o["seq"] for o in LEDGER_DATA}
    existing_seqs = {
        int(n.split("-")[-1]) for n in existing_orders if n.startswith("ORD-")
    }
    missing_seqs = sorted(needed_seqs - existing_seqs)
    if missing_seqs:
        first_missing = missing_seqs[0]
        expected_next = max_seq + 1
        if first_missing != expected_next:
            print(
                f"\n  ERROR: Sequence gap — existing max is {max_seq} but "
                f"first missing seq is {first_missing}.\n"
                f"  Existing seqs: {sorted(existing_seqs)}\n"
                f"  Missing seqs:  {missing_seqs}\n"
                "  Cannot auto-generate correct order numbers. Fix gaps manually first."
            )
            sys.exit(1)

    # -- Stats counters --------------------------------------------------------
    orders_created = orders_skipped = 0
    bills_created = bills_skipped = 0
    payments_created = expenses_created = 0

    order_map = dict(existing_orders)   # order_number -> id
    bill_map  = dict(existing_bills)    # bill_number  -> id

    # -- Step 3: Create missing orders (in sequence) ---------------------------
    print("\n-- ORDERS ----------------------------------------------------------")
    for order in sorted(LEDGER_DATA, key=lambda o: o["seq"]):
        expected = f"ORD-202604-{order['seq']:04d}"
        if expected in order_map:
            print(f"  SKIP  {expected}")
            orders_skipped += 1
            continue

        payload = {
            "party_id": party_id,
            "goods_description": order["goods_description"],
            "total_quantity": order["total_quantity"],
            "stitch_rate_party": str(order["stitch_rate_party"]),
            "stitch_rate_labor": "0",
            "entry_date": order["entry_date"],
            "items": [{"size": "default", "quantity": order["total_quantity"]}],
        }
        if order.get("pack_rate_party") is not None:
            payload["pack_rate_party"] = str(order["pack_rate_party"])
            payload["pack_rate_labor"] = "0"
        if order.get("lot_number") is not None:
            payload["lot_number"] = order["lot_number"]

        if args.dry_run:
            print(f"  [DRY]  Would CREATE {expected}: {order['goods_description']}")
            order_map[expected] = f"DRY-{order['seq']}"
            orders_created += 1
            continue

        r = s.post(f"{base}/orders/", json=payload)
        if not r.ok:
            print(f"  ERROR {expected}: {r.status_code}  {r.text[:300]}")
            sys.exit(1)

        actual = r.json()["order_number"]
        if actual != expected:
            print(
                f"  ERROR: Expected {expected} but API returned {actual}.\n"
                "  Order sequence mismatch — aborting."
            )
            sys.exit(1)

        order_map[actual] = r.json()["id"]
        print(f"  CREATE {actual}: {order['goods_description']}")
        orders_created += 1

    # -- Step 4: Create missing bills -----------------------------------------
    print("\n-- BILLS ------------------------------------------------------------")
    for order in sorted(LEDGER_DATA, key=lambda o: o["seq"]):
        expected_ord = f"ORD-202604-{order['seq']:04d}"
        order_id = order_map.get(expected_ord)
        if order_id is None:
            print(f"  ERROR: No order ID for {expected_ord} — skipping bills")
            continue

        for bill in order["bills"]:
            bnum = bill["number"]
            if bnum in bill_map:
                print(f"  SKIP  Bill {bnum}")
                bills_skipped += 1
                continue

            payload = {
                "order_id": order_id,
                "party_id": party_id,
                "bill_number": bnum,
                "bill_series": bill["series"],
                "bill_date": bill["date"],
                "amount_due": str(bill["amount"]),
            }

            if args.dry_run:
                print(f"  [DRY]  Would CREATE Bill {bnum} ({bill['series']}, {bill['amount']:,})")
                bill_map[bnum] = f"DRY-BILL-{bnum}"
                bills_created += 1
                continue

            r = s.post(f"{base}/bills/", json=payload)
            if not r.ok:
                print(f"  ERROR Bill {bnum}: {r.status_code}  {r.text[:300]}")
                continue

            bill_map[bnum] = r.json()["id"]
            print(f"  CREATE Bill {bnum}  {bill['series']}-series  {bill['amount']:,}")
            bills_created += 1

    # -- Step 5: Record payments -----------------------------------------------
    print("\n-- PAYMENTS ---------------------------------------------------------")

    def record_payment(date, amount, bill_num, ref, method, desc=None):
        nonlocal payments_created

        # Idempotency: skip if reference already in DB
        if ref and ref in existing_refs:
            print(f"  SKIP  Payment {amount:,} ref={ref} (already recorded)")
            return

        bill_id = bill_map.get(bill_num) if bill_num else None

        payload = {
            "transaction_type": "payment",
            "party_id": party_id,
            "amount": str(amount),
            "transaction_date": date,
            "payment_method": method,
            "description": desc or f"Payment {amount:,}",
        }
        if ref:
            payload["reference_number"] = ref
        if bill_id:
            payload["bill_id"] = bill_id

        label = f"Bill {bill_num}" if bill_num else (desc or "standalone")

        if args.dry_run:
            print(f"  [DRY]  Would PAY {amount:,} -> {label}  ref={ref}")
            if ref:
                existing_refs.add(ref)
            payments_created += 1
            return

        r = s.post(f"{base}/transactions/", json=payload)
        if not r.ok:
            print(f"  ERROR payment {amount:,} -> {label}: {r.status_code}  {r.text[:200]}")
            return

        if ref:
            existing_refs.add(ref)  # prevent duplicate in same run
        print(f"  PAY   {amount:,} -> {label}  ref={ref or 'none'}  ({method})")
        payments_created += 1

    for order in sorted(LEDGER_DATA, key=lambda o: o["seq"]):
        for pmt in order["payments"]:
            record_payment(
                date=pmt["date"],
                amount=pmt["amount"],
                bill_num=pmt.get("bill"),
                ref=pmt.get("ref"),
                method=pmt.get("method", "bank_transfer"),
                desc=pmt.get("desc"),
            )

    for pmt in STANDALONE_PAYMENTS:
        record_payment(
            date=pmt["date"],
            amount=pmt["amount"],
            bill_num=pmt.get("bill"),
            ref=pmt.get("ref"),
            method=pmt.get("method", "bank_transfer"),
            desc=pmt.get("desc"),
        )

    # -- Step 6: Create expense transactions -----------------------------------
    print("\n-- EXPENSES ---------------------------------------------------------")
    for exp in EXPENSE_TRANSACTIONS:
        ref = exp.get("ref")
        if ref and ref in existing_refs:
            print(f"  SKIP  {exp['desc']} ref={ref}")
            continue

        payload = {
            "transaction_type": "expense",
            "party_id": party_id,
            "amount": str(exp["amount"]),
            "transaction_date": exp["date"],
            "description": exp["desc"],
        }
        if ref:
            payload["reference_number"] = ref

        if args.dry_run:
            print(f"  [DRY]  Would EXP {exp['amount']:,}  {exp['desc']}  ({exp['date']})")
            if ref:
                existing_refs.add(ref)
            expenses_created += 1
            continue

        r = s.post(f"{base}/transactions/", json=payload)
        if not r.ok:
            print(f"  ERROR expense {exp['desc']}: {r.status_code}  {r.text[:200]}")
            continue

        if ref:
            existing_refs.add(ref)
        print(f"  EXP   {exp['amount']:,}  {exp['desc']}  ({exp['date']})")
        expenses_created += 1

    # -- Step 7: Corrections — patch wrong lot numbers in existing orders -----
    print("\n-- CORRECTIONS -----------------------------------------------------")
    # ORD-202604-0029 (Central Plaza) was incorrectly assigned lot_number=37.
    # lot_number 37 belongs exclusively to ORD-202604-0032.
    ord_0029 = f"ORD-202604-{29:04d}"
    if ord_0029 in order_map:
        if args.dry_run:
            print(f"  [DRY]  Would PATCH {ord_0029}: lot_number -> null")
        else:
            r = s.patch(f"{base}/orders/{order_map[ord_0029]}", json={"lot_number": None})
            if r.ok:
                print(f"  PATCH {ord_0029}: lot_number cleared (was 37)")
            else:
                print(f"  ERROR patching {ord_0029}: {r.status_code}  {r.text[:200]}")
    else:
        print(f"  SKIP  {ord_0029} not found in DB (nothing to patch)")

    # -- Summary ---------------------------------------------------------------
    print("\n" + "=" * 68)
    print("IMPORT COMPLETE")
    print(f"  Orders:   {orders_created} created,  {orders_skipped} skipped")
    print(f"  Bills:    {bills_created} created,  {bills_skipped} skipped")
    print(f"  Payments: {payments_created} created")
    print(f"  Expenses: {expenses_created} created")
    print("=" * 68)
    if not args.dry_run:
        print(f"\nVerify ledger: GET {base}/parties/{party_id}/ledger")


if __name__ == "__main__":
    main()
