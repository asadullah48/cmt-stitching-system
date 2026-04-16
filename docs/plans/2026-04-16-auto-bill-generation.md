# Auto Bill Generation — Design

**Date:** 2026-04-16

## Problem

Bills for labour and vendor are created manually every order. Rates are known in advance per product type. The goal is to eliminate manual entry by auto-generating all bills the moment an order is dispatched.

## Solution Overview

Three-ledger system: Party (receivable), Labour (payable), Vendor (payable). A rate template table maps product type × bill series to three rates. Dispatch fires all bills automatically.

---

## Rate Templates

| Product | Series | Customer Rate | Labour Rate | Vendor Rate |
|---------|--------|--------------|-------------|-------------|
| Bedrail | A | 135 | 42 | — |
| Bedrail | C | 80 | 60 | — |
| Castel | A | 360 | 200 | — |
| Castel | C | 30 | 20 | — |
| Tent House | A | 360 | 200 | — |
| Tent House | C | 30 | 20 | — |
| Garment Rack | A | 50 | 20 | 10 |
| Bedrail Zip | B | 34 | — | 20 |

Customer rate = what we bill the party. Labour/Vendor rates = what we owe internally. CMT keeps the margin.

---

## Data Model Changes

### 1. `Party` — add `party_type`

```python
party_type = Column(String(10), default="customer")  # customer | labour | vendor
```

Seed two internal parties on migration:
- **CMT Labour** (party_type: labour)
- **CMT Vendors** (party_type: vendor)

### 2. New table: `cmt_bill_rate_templates`

```python
class BillRateTemplate(BaseModel):
    __tablename__ = "cmt_bill_rate_templates"

    goods_type   = Column(String(50))       # match keyword: bedrail, castel, tent, garment rack, zip
    bill_series  = Column(String(1))        # A | B | C
    description  = Column(String(200))      # "Stitching 40 + Polybag 2"
    customer_rate = Column(Numeric(10,2))   # billed to party × qty
    labour_rate   = Column(Numeric(10,2), default=0)  # billed to Labour party × qty (0 = skip)
    vendor_rate   = Column(Numeric(10,2), default=0)  # billed to Vendor party × qty (0 = skip)
    is_active     = Column(Boolean, default=True)
```

---

## Dispatch Trigger — Two Entry Points

**A) "Dispatch Order" button** on the order detail page — fires auto-bill generation immediately.

**B) Status reaches `packing_complete`** — same auto-bill logic runs in the background (via the existing status update endpoint hook).

Both paths call the same `auto_generate_bills(order, db, user_id)` service function.

### `auto_generate_bills` Logic

```
1. Find all active templates where goods_type keyword in order.goods_description (case-insensitive)
2. For each template:
   a. If customer_rate > 0 and no existing bill of this series exists for order:
      → Create bill against order.party at customer_rate × order.total_quantity
   b. If labour_rate > 0:
      → Create FinancialTransaction (debit) against CMT Labour party
   c. If vendor_rate > 0:
      → Create FinancialTransaction (debit) against CMT Vendors party
3. Mark order.status = "dispatched"
```

Skip any bill series where a bill already exists (existing multi-bill invariant preserved).

---

## Payment Distribution Flow

1. Party pays us → manual cash/bank entry (overhead page, unchanged)
2. We pay labour → record `payment` transaction on CMT Labour party ledger
3. We pay vendor → record `payment` transaction on CMT Vendors party ledger

No new UI — existing party ledger + payment entry handles this.

---

## Frontend Changes

### Party list page
- Add type filter tabs: All | Customers | Labour | Vendors
- Labour/Vendor parties show "Payable" balance label instead of "Receivable"

### Order detail page
- Add **"Dispatch & Bill"** button (only visible when status is `packing_complete`)
- Shows preview of bills that will be generated before confirming

### Bill rate templates page (new, under Settings)
- Simple table: view / edit rates
- No create/delete for now — rates are seeded, just editable

---

## Build Order

```
1. Migration: add party_type to cmt_parties, create cmt_bill_rate_templates, seed data
2. Backend: BillRateTemplate model + schema + endpoint (GET/PATCH only)
3. Backend: auto_generate_bills() service function
4. Backend: hook into dispatch endpoint + packing_complete status change
5. Frontend: party type filter on party list
6. Frontend: "Dispatch & Bill" button on order detail
7. Frontend: rate template editor in Settings
```
