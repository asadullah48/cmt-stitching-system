# Order Accessories Design

**Date:** 2026-04-01  
**Status:** Approved — ready to build

---

## Problem

Orders involve accessories (zip, thread, lace, fabric, etc.) that the factory purchases on behalf of the party. These costs must appear on the party's bill and ledger, not just as internal expenses.

**Example:**  
- Order: 1,023 bedrails × PKR 135 = 138,105  
- Accessories: 1,023 zips × PKR 35 = 35,805 (23 from stock, 1,000 purchased at PKR 30 each)  
- Bill total: 173,910

---

## Data Model

New table: `cmt_order_accessories`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| order_id | UUID FK → cmt_orders | |
| name | String(100) | e.g. "Zip", "Thread" |
| total_qty | Numeric(10,2) | Total needed for order |
| unit_price | Numeric(10,2) | Charged to party |
| from_stock | Numeric(10,2) | Taken from existing inventory |
| purchased_qty | Numeric(10,2) | Newly purchased |
| purchase_cost | Numeric(10,2) | What you paid per unit (optional) |
| is_deleted | Boolean | Soft delete |
| created_at / updated_at | DateTime | |

**Calculated (frontend only):**
- `total_charge = total_qty × unit_price` → on bill
- `total_purchase_spend = purchased_qty × purchase_cost` → your actual cost

---

## How It Flows

1. **Order detail** — Accessories panel: add/remove line items per order
2. **Bill/Invoice** — Accessories appear as separate line items below service rows; `amount_due` updated to include them
3. **Party Ledger** — Bill `amount_due` already feeds ledger; no extra work needed
4. **Inventory** — When `from_stock > 0`, deduct from matching inventory item by name (best-effort, not hard-blocked)

---

## UI

- **Order detail**: New "Accessories" card between Colour Breakdown and Material Requirements
- Inline add form (same pattern as packing expenses)
- **Bill page**: Extra rows in items table under an "Accessories" subheading

---

## Future Iterations

- Surplus/shortfall tracking across multiple orders
- Link accessories to inventory items by ID (not just name)
- Purchase cost vs charge margin report
