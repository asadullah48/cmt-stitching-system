# Smart Insights, Personal UI & Data Entry Design

**Date:** 2026-03-12

## Goal

Make the app feel personal and intelligent for solo daily use. Surface problems automatically before they become costly. Speed up data entry for the Feb 2025 backlog and all future entries.

---

## 1. Personal UI Touches

### 1a. Dashboard "This Month" Summary Bar
Replace the generic dashboard header with a personal stats strip:
- Orders this month
- PKR earned (total billed)
- PKR collected (payments received)
- PKR outstanding (billed minus collected)

Data comes from existing `/dashboard/summary` endpoint — extend it with monthly figures.

### 1b. Floating Quick-Add Button
A fixed `+` button (bottom-right, blue, visible on all dashboard pages).
Clicking opens the New Order slide-in sheet without leaving the current page.

### 1c. Business Config in Sidebar
A `/settings` page stores: business name, owner name.
Sidebar shows these instead of the hardcoded "CMT System / Stitching & Packing".
Stored in the existing `cmt_config` table (key-value pairs already exist).

---

## 2. Smart Insights Panel

A dismissable card at the top of the dashboard. Runs 9 rule-based checks on every load.
Alerts are dismissable per-session (localStorage). Resets daily.

### Order & Billing Checks
| # | Check | Threshold (configurable) |
|---|---|---|
| 1 | Order missing pack rate, but party's last 5 orders had pack rate | — |
| 2 | Order at `packing_complete` with no bill | > 3 days (default) |
| 3 | Bill amount < party's average bill rate per unit | > 10% deviation (default) |
| 4 | Order stitch rate differs from party's last 5 orders | > 10% deviation (default) |
| 5 | Party outstanding balance not cleared | > 30 days (default) |

### Inventory Checks
| # | Check | Threshold (configurable) |
|---|---|---|
| 6 | Raw material item below minimum stock | Per item (set in settings) |
| 7 | Goods on hold (order received, status still pending) | > 5 days (default) |
| 8 | Order packed but no bill created | > 3 days (default — same as check 2) |
| 9 | Packaging material (cartons, bags) below minimum | Per item (set in settings) |

### Alert Format
Each alert shows:
- Icon: ⚠ warning (orange) or ℹ info (blue)
- Short message with order/party name and specific detail
- "View" link to the relevant record
- "Dismiss" × button

---

## 3. Settings Page (`/settings`)

Simple editable form. Saves to `cmt_config` table as key-value pairs.

### Sections:
**Business Info**
- Business name
- Owner name

**Alert Thresholds**
- Days before "no bill" alert (default: 3)
- Days before "goods on hold" alert (default: 5)
- Days before "outstanding payment" alert (default: 30)
- Rate deviation % before flagging (default: 10)

**Inventory Minimums**
- Table: each inventory item with an editable "minimum stock" column
- Already have inventory items in DB — just add `min_stock` field

New backend field: add `min_stock` column to `cmt_inventory_items`.
New backend endpoint: `GET /insights/` — returns all current alerts as JSON.
New backend endpoint: `GET /settings/` + `PUT /settings/` — read/write config.

---

## 4. Clone/Repeat Order

On every order detail page (`/orders/[id]`), add a **"Clone Order"** button.

Clicking navigates to `/orders/new` with URL params pre-filled:
`/orders/new?clone=<order_id>`

The new order form reads these params and pre-fills:
- Party
- Goods description
- Rates (stitch + pack)
- Items (sizes + quantities)
- Product

User changes date and quantities as needed. One-click entry for repeated orders.

No backend changes needed — reuses existing `POST /orders/` endpoint.

---

## 5. CSV Bulk Import (`/orders/import`)

### Flow
1. User downloads Excel template (pre-formatted columns)
2. User fills in records (one row per order, with items as extra columns)
3. User uploads the file
4. Preview table shows parsed orders — user can edit/remove rows
5. User clicks "Import All" → backend creates all orders in one transaction

### CSV Template Columns
`order_date, party_name, goods_description, total_quantity, stitch_rate_party, stitch_rate_labor, pack_rate_party, pack_rate_labor, delivery_date, notes, size_s, size_m, size_l, size_xl, size_xxl`

### Backend
New endpoint: `POST /orders/bulk-import`
- Accepts JSON array of orders
- Matches party by name (case-insensitive) — creates party if not found
- Wraps entire import in one DB transaction (all succeed or all fail)
- Returns summary: `{ created: 45, errors: [{ row: 3, reason: "..." }] }`

### Frontend
New page: `/orders/import`
- "Download Template" button (generates CSV client-side)
- File upload (CSV or Excel via `xlsx` library)
- Preview table with editable cells
- Import button with progress indicator

---

## Implementation Order

1. Settings page + config API (foundation for everything else)
2. min_stock field on inventory items
3. Insights API endpoint (backend rules engine)
4. Smart Insights panel on dashboard
5. Personal UI touches (summary bar, quick-add, sidebar config)
6. Clone order button
7. CSV bulk import
