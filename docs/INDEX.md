# CMT Stitching System — Documentation Index

All planning, design, and reference documents for the project.

---

## Reference Documents (living)

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](../CLAUDE.md) | Critical rules for the AI assistant — stack, conventions, red flags |
| [AGENTS.md](../AGENTS.md) | Full architecture, file layout, endpoints, migration chain |
| [README.md](../README.md) | Project overview, features, setup, deployment |

---

## Planning Documents

Detailed design and implementation plans. See [plans/README.md](./plans/README.md) for the full indexed table.

### Architecture & Foundation

| Document | Summary |
|----------|---------|
| [CMT System Design](./plans/2026-03-02-cmt-system-design.md) | Original architecture and conventions |
| [Phase 1 Implementation Plan](./plans/2026-03-03-phase1-implementation-plan.md) | Auth, orders, financial ledger, production tracking |

### UI / UX

| Document | Summary |
|----------|---------|
| [Polish Plan](./plans/2026-03-07-polish.md) | Visual quality, missing features, production hardening |
| [UI Redesign + Quality & Dispatch](./plans/2026-03-07-ui-redesign-and-features.md) | Dark-navy sidebar, quality checkpoints, dispatch module |
| [Sidebar Toggle](./plans/2026-03-16-sidebar-toggle.md) | Collapsible sidebar with localStorage state |

### Domain Features

| Document | Summary |
|----------|---------|
| [BOM / Material Requirements](./plans/2026-03-08-bom-material-requirements.md) | Product templates with BOM, auto-inventory consumption |
| [Product Catalog](./plans/2026-03-08-product-catalog.md) | Product catalog with colors and order linking |
| [Order Lifecycle Pipeline](./plans/2026-03-12-order-lifecycle-pipeline.md) | Horizontal pipeline tracker on order detail page |
| [Todo Feature](./plans/2026-03-15-todo-feature.md) | Recurring tasks, kanban view, floating quick-add |
| [Overhead & Cash Management](./plans/2026-03-15-overhead-cash-management.md) | Overhead tracker, two cash accounts, running balance |

### Financial & Billing

| Document | Summary |
|----------|---------|
| [Bills Feature](./plans/2026-03-12-bills-feature.md) | Auto-numbered bill series, payment tracking, ledger |
| [Order Accessories Design](./plans/2026-04-01-order-accessories-design.md) | Design doc for accessory line items on bills |
| [Order Accessories Implementation](./plans/2026-04-01-order-accessories-impl.md) | Per-order accessories flowing into party bill and ledger |
| [Standalone Bills](./plans/2026-04-01-standalone-bills.md) | Bills without a linked order (`order_id = null`) |
| [Multiple Bills Per Order](./plans/2026-04-02-multiple-bills-per-order.md) | A-bill + B-bill + C-bill per order; dispatch invariants |
| [Party Statement Share Links](./plans/2026-04-02-party-statement-share-links.md) | Token-based read-only bill/statement URLs |
| [Lot Numbers & Sub-Orders](./plans/2026-04-02-lot-numbers-and-sub-orders.md) | Per-party lot sequencing, sub-order packing stages |
| [Auto-Bill Generation](./plans/2026-04-16-auto-bill-generation.md) | Rate templates, three-ledger system, Dispatch & Bill button |

### Insights & Analytics

| Document | Summary |
|----------|---------|
| [Smart Insights Design](./plans/2026-03-12-smart-insights-design.md) | Design — personal dashboard stats, insights panel |
| [Smart Insights Plan](./plans/2026-03-12-smart-insights-plan.md) | Partially implemented — `/insights/` endpoint live |
