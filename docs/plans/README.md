# docs/plans — Navigation Index

20 planning documents organized by domain. Each document is prefixed with its creation date.
Status: `Implemented` | `Partially implemented` | `Design only`

---

## Architecture & Foundation

| Date | Document | Status |
|------|----------|--------|
| 2026-03-02 | [CMT System Architecture & Design](./2026-03-02-cmt-system-design.md) | Implemented — original system design; conventions now in AGENTS.md |
| 2026-03-03 | [Phase 1 Implementation Plan](./2026-03-03-phase1-implementation-plan.md) | Implemented — auth, orders, financial ledger, production tracking |

---

## UI/UX

| Date | Document | Status |
|------|----------|--------|
| 2026-03-07 | [Polish Plan](./2026-03-07-polish.md) | Implemented — visual quality, missing features, production hardening |
| 2026-03-07 | [UI Redesign + Quality & Dispatch](./2026-03-07-ui-redesign-and-features.md) | Implemented — dark-navy sidebar, quality checkpoints, dispatch module |
| 2026-03-16 | [Sidebar Toggle](./2026-03-16-sidebar-toggle.md) | Implemented — VS Code-style ☰ toggle with localStorage state |

---

## Domain Features

| Date | Document | Status |
|------|----------|--------|
| 2026-03-08 | [BOM / Material Requirements](./2026-03-08-bom-material-requirements.md) | Implemented — product templates with BOM, auto-inventory consumption |
| 2026-03-08 | [Product Catalog](./2026-03-08-product-catalog.md) | Implemented — product catalog with colors and order linking |
| 2026-03-12 | [Order Lifecycle Pipeline](./2026-03-12-order-lifecycle-pipeline.md) | Implemented — horizontal pipeline tracker on order detail page |
| 2026-03-15 | [Todo Feature](./2026-03-15-todo-feature.md) | Implemented — recurring tasks, kanban view, floating quick-add button |
| 2026-03-15 | [Overhead & Cash Management](./2026-03-15-overhead-cash-management.md) | Implemented — overhead tracker, two cash accounts, running balance ledger |

---

## Financial & Billing

| Date | Document | Status |
|------|----------|--------|
| 2026-03-12 | [Bills Feature](./2026-03-12-bills-feature.md) | Implemented — auto-numbered bill series, payment tracking, ledger integration |
| 2026-04-01 | [Order Accessories Design](./2026-04-01-order-accessories-design.md) | Implemented — design doc for accessory line items on bills |
| 2026-04-01 | [Order Accessories Implementation](./2026-04-01-order-accessories-impl.md) | Implemented — per-order accessories flowing into party bill and ledger |
| 2026-04-01 | [Standalone Bills](./2026-04-01-standalone-bills.md) | Implemented — bills without a linked order (`order_id = null`) |
| 2026-04-02 | [Multiple Bills Per Order](./2026-04-02-multiple-bills-per-order.md) | Implemented — removed 1-bill guard; A-bill + B-bill per order |
| 2026-04-02 | [Party Statement Share Links](./2026-04-02-party-statement-share-links.md) | Implemented — token-based read-only bill/statement URLs |
| 2026-04-02 | [Lot Numbers & Sub-Orders](./2026-04-02-lot-numbers-and-sub-orders.md) | Implemented — per-party lot sequencing, B sub-order packing stages |
| 2026-04-16 | [Auto-Bill Generation](./2026-04-16-auto-bill-generation.md) | Implemented — rate templates, three-ledger system, Dispatch & Bill button |

---

## Insights & Analytics

| Date | Document | Status |
|------|----------|--------|
| 2026-03-12 | [Smart Insights Design](./2026-03-12-smart-insights-design.md) | Design only — personal dashboard stats, insights panel, clone order, CSV import |
| 2026-03-12 | [Smart Insights Plan](./2026-03-12-smart-insights-plan.md) | Partially implemented — `/insights/` endpoint exists; rule-based insights and CSV bulk import not built |
