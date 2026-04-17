# UI/UX Redesign + Quality & Dispatch Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the CMT system UI to match the dark-navy reference images and add Quality Checkpoints, Defect Logging, and Packing/Dispatch modules end-to-end.

**Architecture:** Dark navy sidebar across all pages; main content stays white/light-gray. Three new backend feature areas (quality, dispatch, dashboard enhancements) each follow the existing pattern: model → migration → schema → service → endpoint → frontend page/component.

**Tech Stack:** Next.js 15 App Router, TailwindCSS v4, FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, Neon PostgreSQL (tables prefixed `cmt_`)

---

## Task 1: Dark Navy Sidebar + Quality & Dispatch Nav Items

**Files:**
- Modify: `frontend/src/app/(dashboard)/layout.tsx`

**Step 1: Replace sidebar background and text colors**

Replace the entire `Sidebar` function with this implementation:

```tsx
function Sidebar() {
  const pathname = usePathname();
  const { user, role, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-[#1a2744] flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">CMT System</p>
            <p className="text-xs text-blue-300 leading-tight">Stitching & Packing</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {NAV_ITEMS.filter(
            (item) => !item.roles || (role && item.roles.includes(role))
          ).map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-blue-200 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span className={cn(isActive ? "text-white" : "text-blue-300")}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-white">
              {user?.username?.[0]?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-blue-300 capitalize truncate">{role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1 rounded text-blue-300 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
```

**Step 2: Add Quality and Dispatch to NAV_ITEMS**

Add two new icon functions before NAV_ITEMS:

```tsx
function IconShield() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
```

Replace NAV_ITEMS with:

```tsx
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <IconGrid /> },
  { label: "Orders", href: "/orders", icon: <IconClipboard /> },
  { label: "Parties", href: "/parties", icon: <IconUsers /> },
  { label: "Production", href: "/production", icon: <IconFactory /> },
  { label: "Quality", href: "/quality", icon: <IconShield /> },
  { label: "Dispatch", href: "/dispatch", icon: <IconTruck /> },
  {
    label: "Ledger",
    href: "/ledger",
    icon: <IconWallet />,
    roles: ["admin", "accountant"],
  },
];
```

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/layout.tsx
git commit -m "feat: dark navy sidebar with Quality and Dispatch nav items"
```

---

## Task 2: Dashboard Redesign — Stats Bar, Progress Bars, Quick Actions

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/services/dashboard_service.py`

**Step 1: Update DashboardSummary schema to add new fields**

In `backend/app/schemas/dashboard.py`, add to the `DashboardSummary` model:

```python
completed_today: int = 0
active_orders: int = 0
on_hold_orders: int = 0
stitching_progress_pct: float = 0.0
packing_progress_pct: float = 0.0
```

**Step 2: Update dashboard_service.py to compute new fields**

In `backend/app/services/dashboard_service.py`, update `get_summary` to compute:

```python
from app.models.production import ProductionSession

# completed_today: orders dispatched today
today = date.today()
completed_today = (
    db.query(func.count(Order.id))
    .filter(
        Order.status == "dispatched",
        Order.is_deleted.is_(False),
        func.date(Order.updated_at) == today,
    )
    .scalar()
) or 0

# active_orders: stitching or packing in progress
active_orders = (
    counts.get("stitching_in_progress", 0) +
    counts.get("packing_in_progress", 0)
)

# on_hold_orders: pending (waiting to start)
on_hold_orders = counts.get("pending", 0)

# stitching progress: sum(completed_quantity) / sum(total_quantity) for stitching orders
from app.models.orders import OrderItem
stitch_q = (
    db.query(
        func.coalesce(func.sum(OrderItem.completed_quantity), 0),
        func.coalesce(func.sum(OrderItem.quantity), 1),
    )
    .join(Order, OrderItem.order_id == Order.id)
    .filter(
        Order.status.in_(["stitching_in_progress", "stitching_complete"]),
        Order.is_deleted.is_(False),
    )
    .first()
)
stitching_progress_pct = round(
    float(stitch_q[0]) / float(stitch_q[1]) * 100, 1
) if stitch_q and stitch_q[1] > 0 else 0.0

# packing progress
pack_q = (
    db.query(
        func.coalesce(func.sum(OrderItem.packed_quantity), 0),
        func.coalesce(func.sum(OrderItem.quantity), 1),
    )
    .join(Order, OrderItem.order_id == Order.id)
    .filter(
        Order.status.in_(["packing_in_progress", "packing_complete"]),
        Order.is_deleted.is_(False),
    )
    .first()
)
packing_progress_pct = round(
    float(pack_q[0]) / float(pack_q[1]) * 100, 1
) if pack_q and pack_q[1] > 0 else 0.0
```

Add these fields to the `DashboardSummary(...)` return call.

**Step 3: Rewrite dashboard/page.tsx**

Replace the entire file with:

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardService } from "@/hooks/services";
import { formatCurrency, formatDate, getStatusConfig } from "@/hooks/utils";
import { StatusBadge, DataTable } from "@/components/common";
import type { DashboardSummary, Order } from "@/hooks/types";
import type { Column } from "@/components/common";

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${color.replace("text-", "bg-")}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    dashboardService.getSummary().then(setSummary).finally(() => setLoading(false));
  }, []);

  const recentOrderColumns: Column<Order>[] = [
    {
      key: "order_number", header: "Order #",
      render: (row) => <span className="font-medium text-blue-600">{row.order_number}</span>,
    },
    {
      key: "party_name", header: "Party",
      render: (row) => row.party_name ?? row.party_reference ?? "—",
    },
    {
      key: "goods_description", header: "Goods",
      render: (row) => <span className="truncate max-w-[180px] block">{row.goods_description}</span>,
    },
    {
      key: "total_quantity", header: "Qty",
      render: (row) => row.total_quantity.toLocaleString(),
      className: "text-right", headerClassName: "text-right",
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "delivery_date", header: "Delivery", render: (row) => formatDate(row.delivery_date) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">CMT Stitching & Packing System Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live operations overview</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active Orders" value={loading ? "…" : (summary?.active_orders ?? 0)} color="text-blue-600" />
        <StatCard label="On Hold" value={loading ? "…" : (summary?.on_hold_orders ?? 0)} color="text-orange-500" />
        <StatCard label="Completed Today" value={loading ? "…" : (summary?.completed_today ?? 0)} color="text-green-600" />
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-2 gap-4">
        <ProgressBar label="Stitching Progress" value={loading ? 0 : (summary?.stitching_progress_pct ?? 0)} color="text-blue-600" />
        <ProgressBar label="Packing Progress" value={loading ? 0 : (summary?.packing_progress_pct ?? 0)} color="text-indigo-600" />
      </div>

      {/* Pipeline + Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Revenue (Month)</p>
          <p className="text-lg font-bold text-gray-900">
            PKR {loading ? "…" : formatCurrency(summary?.total_revenue_month ?? 0)}
          </p>
        </div>
        {(["pending", "stitching_in_progress", "packing_in_progress", "dispatched"] as const).map((s) => {
          const cfg = getStatusConfig(s);
          const countMap = {
            pending: summary?.pending_orders ?? 0,
            stitching_in_progress: summary?.stitching_in_progress ?? 0,
            packing_in_progress: summary?.packing_in_progress ?? 0,
            dispatched: summary?.dispatched ?? 0,
          };
          return (
            <div key={s} className={`rounded-xl px-4 py-3 ${cfg.bg}`}>
              <p className={`text-lg font-bold ${cfg.text}`}>{loading ? "…" : countMap[s]}</p>
              <p className={`text-xs ${cfg.text} opacity-80`}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push("/orders?new=1")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Order
        </button>
        <button
          onClick={() => router.push("/production")}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Start Batch
        </button>
        <button
          onClick={() => router.push("/quality")}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          QC Check
        </button>
        <button
          onClick={() => router.push("/dispatch")}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Report
        </button>
      </div>

      {/* Recent Orders */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Orders</h2>
        <DataTable
          columns={recentOrderColumns}
          data={summary?.recent_orders ?? []}
          loading={loading}
          keyExtractor={(row) => row.id}
          emptyMessage="No orders yet"
        />
      </div>
    </div>
  );
}
```

**Step 4: Update DashboardSummary type in frontend**

In `frontend/src/hooks/types.ts`, add to the `DashboardSummary` interface:

```ts
completed_today: number;
active_orders: number;
on_hold_orders: number;
stitching_progress_pct: number;
packing_progress_pct: number;
```

**Step 5: Commit**

```bash
git add backend/app/schemas/dashboard.py backend/app/services/dashboard_service.py
git add frontend/src/app/(dashboard)/dashboard/page.tsx frontend/src/hooks/types.ts
git commit -m "feat: redesign dashboard with stats bar, progress bars, quick actions"
```

---

## Task 3: Backend — Quality Checkpoints + Defect Logs Models & Migration

**Files:**
- Create: `backend/app/models/quality.py`
- Modify: `backend/app/models/__init__.py` (or wherever models are registered)
- Create: `backend/alembic/versions/b2c3d4e5f6a7_add_quality_tables.py`

**Step 1: Create quality model**

Create `backend/app/models/quality.py`:

```python
from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel


CHECKPOINT_NAMES = [
    "Pre-Stitch Inspection",
    "Seam Strength Test",
    "Final AQL Audit",
]

DEFECT_TYPES = [
    "Thread Knotting",
    "Misaligned Seam",
    "Puckering",
    "Broken Stitch",
    "Loose Thread",
    "Fabric Damage",
    "Other",
]


class QualityCheckpoint(BaseModel):
    __tablename__ = "cmt_quality_checkpoints"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    checkpoint_name = Column(String(100), nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    checked_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    order = relationship("Order", back_populates="quality_checkpoints")


class DefectLog(BaseModel):
    __tablename__ = "cmt_defect_logs"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    defect_type = Column(String(100), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    notes = Column(Text, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order", back_populates="defect_logs")
```

**Step 2: Add relationships to Order model**

In `backend/app/models/orders.py`, add to `Order` class:

```python
quality_checkpoints = relationship("QualityCheckpoint", back_populates="order", cascade="all, delete-orphan")
defect_logs = relationship("DefectLog", back_populates="order", cascade="all, delete-orphan")
```

**Step 3: Register model in imports**

In `backend/app/models/__init__.py` (or wherever models are imported), add:

```python
from .quality import QualityCheckpoint, DefectLog
```

Check if there's an `__init__.py` — if not, ensure `main.py` imports the quality module so SQLAlchemy discovers it.

**Step 4: Create Alembic migration**

Create `backend/alembic/versions/b2c3d4e5f6a7_add_quality_tables.py`:

```python
"""add quality checkpoints and defect logs tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cmt_quality_checkpoints',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('checkpoint_name', sa.String(100), nullable=False),
        sa.Column('passed', sa.Boolean, default=False, nullable=False),
        sa.Column('checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('is_deleted', sa.Boolean, default=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_table(
        'cmt_defect_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('defect_type', sa.String(100), nullable=False),
        sa.Column('quantity', sa.Integer, default=1, nullable=False),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('logged_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('is_deleted', sa.Boolean, default=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('cmt_defect_logs')
    op.drop_table('cmt_quality_checkpoints')
```

**Step 5: Run migration**

```bash
cd backend
python -m alembic upgrade head
```

Expected output: `Running upgrade a1b2c3d4e5f6 -> b2c3d4e5f6a7`

**Step 6: Commit**

```bash
git add backend/app/models/quality.py backend/app/models/orders.py
git add backend/alembic/versions/b2c3d4e5f6a7_add_quality_tables.py
git commit -m "feat: add quality checkpoints and defect logs models + migration"
```

---

## Task 4: Backend — Dispatch Fields on Order + Migration

**Files:**
- Modify: `backend/app/models/orders.py`
- Modify: `backend/app/schemas/orders.py`
- Create: `backend/alembic/versions/c3d4e5f6a7b8_add_dispatch_fields.py`

**Step 1: Add dispatch columns to Order model**

In `backend/app/models/orders.py`, add after `actual_completion`:

```python
carrier = Column(String(50), nullable=True)       # DHL, FedEx, UPS, SF Express, Other
tracking_number = Column(String(100), nullable=True)
dispatch_date = Column(Date, nullable=True)
carton_count = Column(Integer, nullable=True)
total_weight = Column(Numeric(8, 2), nullable=True)
```

**Step 2: Add dispatch fields to OrderOut schema**

In `backend/app/schemas/orders.py`, add to `OrderOut`:

```python
carrier: Optional[str] = None
tracking_number: Optional[str] = None
dispatch_date: Optional[date] = None
carton_count: Optional[int] = None
total_weight: Optional[Decimal] = None
```

Add to `OrderUpdate`:

```python
carrier: Optional[str] = None
tracking_number: Optional[str] = None
dispatch_date: Optional[date] = None
carton_count: Optional[int] = None
total_weight: Optional[Decimal] = None
```

**Step 3: Create Alembic migration**

Create `backend/alembic/versions/c3d4e5f6a7b8_add_dispatch_fields.py`:

```python
"""add dispatch fields to cmt_orders

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('cmt_orders', sa.Column('carrier', sa.String(50), nullable=True))
    op.add_column('cmt_orders', sa.Column('tracking_number', sa.String(100), nullable=True))
    op.add_column('cmt_orders', sa.Column('dispatch_date', sa.Date, nullable=True))
    op.add_column('cmt_orders', sa.Column('carton_count', sa.Integer, nullable=True))
    op.add_column('cmt_orders', sa.Column('total_weight', sa.Numeric(8, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('cmt_orders', 'total_weight')
    op.drop_column('cmt_orders', 'carton_count')
    op.drop_column('cmt_orders', 'dispatch_date')
    op.drop_column('cmt_orders', 'tracking_number')
    op.drop_column('cmt_orders', 'carrier')
```

**Step 4: Run migration**

```bash
python -m alembic upgrade head
```

Expected: `Running upgrade b2c3d4e5f6a7 -> c3d4e5f6a7b8`

**Step 5: Commit**

```bash
git add backend/app/models/orders.py backend/app/schemas/orders.py
git add backend/alembic/versions/c3d4e5f6a7b8_add_dispatch_fields.py
git commit -m "feat: add carrier/tracking/dispatch fields to orders"
```

---

## Task 5: Backend — Quality API Endpoints

**Files:**
- Create: `backend/app/schemas/quality.py`
- Create: `backend/app/services/quality_service.py`
- Create: `backend/app/api/v1/endpoints/quality.py`
- Modify: `backend/app/api/v1/router.py`

**Step 1: Create quality schemas**

Create `backend/app/schemas/quality.py`:

```python
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class CheckpointUpdate(BaseModel):
    passed: bool
    notes: Optional[str] = None


class CheckpointOut(BaseModel):
    id: UUID
    order_id: UUID
    checkpoint_name: str
    passed: bool
    checked_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class DefectLogCreate(BaseModel):
    order_id: UUID
    defect_type: str
    quantity: int = 1
    notes: Optional[str] = None


class DefectLogOut(BaseModel):
    id: UUID
    order_id: UUID
    defect_type: str
    quantity: int
    notes: Optional[str] = None
    logged_at: datetime

    model_config = {"from_attributes": True}


class QualityReport(BaseModel):
    order_id: UUID
    order_number: str
    checkpoints: List[CheckpointOut]
    defects: List[DefectLogOut]
    all_passed: bool
```

**Step 2: Create quality service**

Create `backend/app/services/quality_service.py`:

```python
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.quality import QualityCheckpoint, DefectLog, CHECKPOINT_NAMES
from app.models.orders import Order
from app.schemas.quality import CheckpointUpdate, DefectLogCreate


class QualityService:
    @staticmethod
    def get_or_create_checkpoints(db: Session, order_id: UUID) -> list[QualityCheckpoint]:
        existing = (
            db.query(QualityCheckpoint)
            .filter(QualityCheckpoint.order_id == order_id, QualityCheckpoint.is_deleted.is_(False))
            .all()
        )
        existing_names = {c.checkpoint_name for c in existing}
        for name in CHECKPOINT_NAMES:
            if name not in existing_names:
                db.add(QualityCheckpoint(order_id=order_id, checkpoint_name=name, passed=False))
        db.commit()
        return (
            db.query(QualityCheckpoint)
            .filter(QualityCheckpoint.order_id == order_id, QualityCheckpoint.is_deleted.is_(False))
            .all()
        )

    @staticmethod
    def update_checkpoint(db: Session, checkpoint_id: UUID, data: CheckpointUpdate) -> QualityCheckpoint:
        cp = db.query(QualityCheckpoint).filter(QualityCheckpoint.id == checkpoint_id).first()
        if not cp:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Checkpoint not found")
        cp.passed = data.passed
        cp.notes = data.notes
        cp.checked_at = datetime.now(timezone.utc) if data.passed else None
        db.commit()
        db.refresh(cp)
        return cp

    @staticmethod
    def log_defect(db: Session, data: DefectLogCreate) -> DefectLog:
        log = DefectLog(**data.model_dump())
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_defects(db: Session, order_id: UUID) -> list[DefectLog]:
        return (
            db.query(DefectLog)
            .filter(DefectLog.order_id == order_id, DefectLog.is_deleted.is_(False))
            .order_by(DefectLog.logged_at.desc())
            .all()
        )
```

**Step 3: Create quality endpoint**

Create `backend/app/api/v1/endpoints/quality.py`:

```python
from uuid import UUID
from fastapi import APIRouter

from app.core.deps import CurrentUser, DbDep
from app.models.orders import Order
from app.schemas.quality import (
    CheckpointOut, CheckpointUpdate, DefectLogCreate, DefectLogOut, QualityReport,
)
from app.services.quality_service import QualityService

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/{order_id}", response_model=QualityReport)
def get_quality_report(order_id: UUID, db: DbDep, _: CurrentUser):
    order = db.query(Order).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Order not found")
    checkpoints = QualityService.get_or_create_checkpoints(db, order_id)
    defects = QualityService.get_defects(db, order_id)
    return QualityReport(
        order_id=order.id,
        order_number=order.order_number,
        checkpoints=checkpoints,
        defects=defects,
        all_passed=all(c.passed for c in checkpoints),
    )


@router.patch("/checkpoints/{checkpoint_id}", response_model=CheckpointOut)
def update_checkpoint(checkpoint_id: UUID, data: CheckpointUpdate, db: DbDep, _: CurrentUser):
    return QualityService.update_checkpoint(db, checkpoint_id, data)


@router.post("/defects", response_model=DefectLogOut, status_code=201)
def log_defect(data: DefectLogCreate, db: DbDep, _: CurrentUser):
    return QualityService.log_defect(db, data)
```

**Step 4: Register router**

In `backend/app/api/v1/router.py`, add:

```python
from app.api.v1.endpoints.quality import router as quality_router
api_router.include_router(quality_router)
```

**Step 5: Commit**

```bash
git add backend/app/schemas/quality.py backend/app/services/quality_service.py
git add backend/app/api/v1/endpoints/quality.py backend/app/api/v1/router.py
git commit -m "feat: add quality checkpoints and defect logging API"
```

---

## Task 6: Backend — Dispatch Endpoint

**Files:**
- Create: `backend/app/api/v1/endpoints/dispatch.py`
- Modify: `backend/app/api/v1/router.py`

**Step 1: Create dispatch endpoint**

Create `backend/app/api/v1/endpoints/dispatch.py`:

```python
import uuid as _uuid
from uuid import UUID
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbDep
from app.models.orders import Order
from app.schemas.orders import OrderOut

router = APIRouter(prefix="/dispatch", tags=["dispatch"])

CARRIERS = ["DHL", "FedEx", "UPS", "SF Express", "TCS", "Leopards", "Other"]


class DispatchUpdate(BaseModel):
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[float] = None


class DispatchOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[float] = None
    party_name: Optional[str] = None
    goods_description: str
    total_quantity: int

    model_config = {"from_attributes": True}


@router.get("/carriers")
def list_carriers(_: CurrentUser):
    return CARRIERS


@router.get("/ready", response_model=List[DispatchOut])
def orders_ready_for_dispatch(db: DbDep, _: CurrentUser):
    orders = (
        db.query(Order)
        .filter(
            Order.status.in_(["packing_complete", "dispatched"]),
            Order.is_deleted.is_(False),
        )
        .order_by(Order.updated_at.desc())
        .all()
    )
    result = []
    for o in orders:
        result.append(DispatchOut(
            id=o.id,
            order_number=o.order_number,
            status=o.status,
            carrier=o.carrier,
            tracking_number=o.tracking_number,
            dispatch_date=o.dispatch_date,
            carton_count=o.carton_count,
            total_weight=float(o.total_weight) if o.total_weight else None,
            party_name=o.party.name if o.party else None,
            goods_description=o.goods_description,
            total_quantity=o.total_quantity,
        ))
    return result


@router.patch("/{order_id}", response_model=DispatchOut)
def update_dispatch(order_id: UUID, data: DispatchUpdate, db: DbDep, _: CurrentUser):
    order = db.query(Order).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(order, field, value)
    # Auto-generate tracking number if carrier set but no tracking_number
    if order.carrier and not order.tracking_number:
        order.tracking_number = f"CMT-{str(order.id)[:8].upper()}"
    db.commit()
    db.refresh(order)
    return DispatchOut(
        id=order.id,
        order_number=order.order_number,
        status=order.status,
        carrier=order.carrier,
        tracking_number=order.tracking_number,
        dispatch_date=order.dispatch_date,
        carton_count=order.carton_count,
        total_weight=float(order.total_weight) if order.total_weight else None,
        party_name=order.party.name if order.party else None,
        goods_description=order.goods_description,
        total_quantity=order.total_quantity,
    )
```

**Step 2: Register router**

In `backend/app/api/v1/router.py`, add:

```python
from app.api.v1.endpoints.dispatch import router as dispatch_router
api_router.include_router(dispatch_router)
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/endpoints/dispatch.py backend/app/api/v1/router.py
git commit -m "feat: add dispatch endpoint with carrier/tracking management"
```

---

## Task 7: Frontend — Quality Page

**Files:**
- Create: `frontend/src/app/(dashboard)/quality/page.tsx`
- Modify: `frontend/src/hooks/services.tsx` (add qualityService)
- Modify: `frontend/src/hooks/types.ts` (add quality types)

**Step 1: Add quality types to types.ts**

```ts
export interface QualityCheckpoint {
  id: string;
  order_id: string;
  checkpoint_name: string;
  passed: boolean;
  checked_at: string | null;
  notes: string | null;
}

export interface DefectLog {
  id: string;
  order_id: string;
  defect_type: string;
  quantity: number;
  notes: string | null;
  logged_at: string;
}

export interface QualityReport {
  order_id: string;
  order_number: string;
  checkpoints: QualityCheckpoint[];
  defects: DefectLog[];
  all_passed: boolean;
}
```

**Step 2: Add qualityService to services.tsx**

```ts
export const qualityService = {
  getReport: async (orderId: string): Promise<QualityReport> => {
    const { data } = await api.get<QualityReport>(`/quality/${orderId}`);
    return data;
  },
  updateCheckpoint: async (checkpointId: string, passed: boolean, notes?: string): Promise<QualityCheckpoint> => {
    const { data } = await api.patch<QualityCheckpoint>(`/quality/checkpoints/${checkpointId}`, { passed, notes });
    return data;
  },
  logDefect: async (orderId: string, defectType: string, quantity: number, notes?: string): Promise<DefectLog> => {
    const { data } = await api.post<DefectLog>(`/quality/defects`, {
      order_id: orderId, defect_type: defectType, quantity, notes,
    });
    return data;
  },
};
```

**Step 3: Create quality page**

Create `frontend/src/app/(dashboard)/quality/page.tsx`:

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ordersService, qualityService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { PageHeader, Select, Button, FormField, Input, Textarea } from "@/components/common";
import type { Order, QualityReport, DefectLog } from "@/hooks/types";

const DEFECT_TYPES = [
  "Thread Knotting", "Misaligned Seam", "Puckering",
  "Broken Stitch", "Loose Thread", "Fabric Damage", "Other",
];

export default function QualityPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Defect form
  const [defectType, setDefectType] = useState(DEFECT_TYPES[0]);
  const [defectQty, setDefectQty] = useState("1");
  const [defectNotes, setDefectNotes] = useState("");
  const [loggingDefect, setLoggingDefect] = useState(false);

  useEffect(() => {
    ordersService.getOrders({ size: 100 }).then((r) => setOrders(r.data));
  }, []);

  const loadReport = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingReport(true);
    try {
      setReport(await qualityService.getReport(id));
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => { loadReport(selectedOrderId); }, [selectedOrderId, loadReport]);

  const toggleCheckpoint = async (cpId: string, passed: boolean) => {
    setSavingId(cpId);
    try {
      await qualityService.updateCheckpoint(cpId, passed);
      await loadReport(selectedOrderId);
      showToast(passed ? "Checkpoint passed ✓" : "Checkpoint marked failed");
    } catch {
      showToast("Failed to update checkpoint", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleLogDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) return;
    setLoggingDefect(true);
    try {
      await qualityService.logDefect(selectedOrderId, defectType, parseInt(defectQty) || 1, defectNotes || undefined);
      await loadReport(selectedOrderId);
      setDefectNotes("");
      setDefectQty("1");
      showToast("Defect logged");
    } catch {
      showToast("Failed to log defect", "error");
    } finally {
      setLoggingDefect(false);
    }
  };

  return (
    <div>
      <PageHeader title="Quality Control" subtitle="Inspect orders and log defects" />

      <div className="mb-6 max-w-sm">
        <FormField label="Select Order">
          <Select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)}>
            <option value="">— Choose an order —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.order_number} — {o.goods_description}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {!selectedOrderId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">Select an order to begin QC</p>
          <p className="text-xs text-gray-400 mt-1">Checkpoints and defect logs will appear here</p>
        </div>
      )}

      {selectedOrderId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quality Checkpoints */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Quality Checkpoints</h2>
            {loadingReport ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <ul className="space-y-3">
                {report?.checkpoints.map((cp) => (
                  <li key={cp.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        cp.passed ? "bg-green-100" : "bg-gray-100"
                      }`}>
                        {cp.passed ? (
                          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-gray-300" />
                        )}
                      </div>
                      <span className={`text-sm ${cp.passed ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                        {cp.checkpoint_name}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleCheckpoint(cp.id, !cp.passed)}
                      disabled={savingId === cp.id}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                        cp.passed
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-green-50 text-green-700 hover:bg-green-100"
                      }`}
                    >
                      {savingId === cp.id ? "…" : cp.passed ? "Undo" : "Pass"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {report && (
              <div className={`mt-4 px-3 py-2 rounded-lg text-sm font-medium ${
                report.all_passed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
              }`}>
                {report.all_passed ? "✓ All checkpoints passed" : "⚠ Some checkpoints pending"}
              </div>
            )}
          </div>

          {/* Defect Logging */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Defect Logging</h2>
            <form onSubmit={handleLogDefect} className="space-y-3 mb-5">
              <FormField label="Defect Type">
                <Select value={defectType} onChange={(e) => setDefectType(e.target.value)}>
                  {DEFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormField>
              <FormField label="Quantity">
                <Input type="number" min="1" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
              </FormField>
              <FormField label="Notes">
                <Textarea rows={2} value={defectNotes} onChange={(e) => setDefectNotes(e.target.value)} placeholder="Optional notes" />
              </FormField>
              <Button type="submit" loading={loggingDefect} className="w-full justify-center">
                Log Defect
              </Button>
            </form>

            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Recent Defects</h3>
            {loadingReport ? <p className="text-sm text-gray-400">Loading…</p> : (
              report?.defects.length === 0 ? (
                <p className="text-sm text-gray-400">No defects logged</p>
              ) : (
                <ul className="space-y-2">
                  {report?.defects.slice(0, 5).map((d: DefectLog) => (
                    <li key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{d.defect_type}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">×{d.quantity}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(d.logged_at).toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/app/(dashboard)/quality/ frontend/src/hooks/types.ts frontend/src/hooks/services.tsx
git commit -m "feat: add quality control page with checkpoints and defect logging"
```

---

## Task 8: Frontend — Packing/Dispatch Page

**Files:**
- Create: `frontend/src/app/(dashboard)/dispatch/page.tsx`
- Modify: `frontend/src/hooks/services.tsx` (add dispatchService)
- Modify: `frontend/src/hooks/types.ts` (add dispatch types)

**Step 1: Add dispatch types to types.ts**

```ts
export interface DispatchOrder {
  id: string;
  order_number: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  carton_count: number | null;
  total_weight: number | null;
  party_name: string | null;
  goods_description: string;
  total_quantity: number;
}
```

**Step 2: Add dispatchService to services.tsx**

```ts
export const dispatchService = {
  getCarriers: async (): Promise<string[]> => {
    const { data } = await api.get<string[]>("/dispatch/carriers");
    return data;
  },
  getReadyOrders: async (): Promise<DispatchOrder[]> => {
    const { data } = await api.get<DispatchOrder[]>("/dispatch/ready");
    return data;
  },
  updateDispatch: async (orderId: string, payload: Partial<DispatchOrder>): Promise<DispatchOrder> => {
    const { data } = await api.patch<DispatchOrder>(`/dispatch/${orderId}`, payload);
    return data;
  },
};
```

**Step 3: Create dispatch page**

Create `frontend/src/app/(dashboard)/dispatch/page.tsx`:

```tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { dispatchService } from "@/hooks/services";
import { useToast } from "@/hooks/toast";
import { PageHeader, Button, FormField, Input, Select } from "@/components/common";
import { formatDate } from "@/hooks/utils";
import type { DispatchOrder } from "@/hooks/types";

export default function DispatchPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DispatchOrder | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [cartonCount, setCartonCount] = useState("");
  const [totalWeight, setTotalWeight] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([dispatchService.getReadyOrders(), dispatchService.getCarriers()]);
      setOrders(o);
      setCarriers(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectOrder = (o: DispatchOrder) => {
    setSelected(o);
    setCarrier(o.carrier ?? "");
    setTrackingNumber(o.tracking_number ?? "");
    setDispatchDate(o.dispatch_date ?? "");
    setCartonCount(o.carton_count?.toString() ?? "");
    setTotalWeight(o.total_weight?.toString() ?? "");
  };

  const generateTracking = () => {
    if (!selected) return;
    const prefix = carrier || "CMT";
    setTrackingNumber(`${prefix.toUpperCase()}-${selected.id.slice(0, 8).toUpperCase()}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await dispatchService.updateDispatch(selected.id, {
        carrier: carrier || undefined,
        tracking_number: trackingNumber || undefined,
        dispatch_date: dispatchDate || undefined,
        carton_count: cartonCount ? parseInt(cartonCount) : undefined,
        total_weight: totalWeight ? parseFloat(totalWeight) : undefined,
      });
      setSelected(updated);
      await load();
      showToast("Dispatch info saved");
    } catch {
      showToast("Failed to save dispatch info", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Packing & Dispatch" subtitle="Manage dispatch details and tracking" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">
            Order Checklist
            <span className="ml-2 text-xs font-normal text-gray-400">Ready for dispatch</span>
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : orders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No orders ready for dispatch</p>
              <p className="text-xs text-gray-300 mt-1">Orders reach here once packing is complete</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => selectOrder(o)}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                      selected?.id === o.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{o.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        o.status === "dispatched" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"
                      }`}>
                        {o.status === "dispatched" ? "Dispatched" : "Ready"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{o.goods_description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Qty: {o.total_quantity.toLocaleString()}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dispatch Details */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 17H5a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l2 3v4h-5m0-7v7m0 0H9m3 0a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">Select an order to manage dispatch</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selected.order_number}</h2>
                  <p className="text-sm text-gray-500">{selected.goods_description} · {selected.total_quantity.toLocaleString()} pcs</p>
                </div>
                {selected.tracking_number && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Tracking ID</p>
                    <p className="text-sm font-mono font-medium text-blue-600">{selected.tracking_number}</p>
                  </div>
                )}
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                <FormField label="Carrier">
                  <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    <option value="">— Select carrier —</option>
                    {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormField>

                <FormField label="Tracking Number">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Auto-generate or enter"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={generateTracking}
                      className="flex-shrink-0 px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </FormField>

                <FormField label="Dispatch Date">
                  <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
                </FormField>

                <FormField label="Carton Count">
                  <Input type="number" min="1" placeholder="e.g. 12" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} />
                </FormField>

                <FormField label="Total Weight (kg)">
                  <Input type="number" step="0.1" min="0" placeholder="e.g. 45.5" value={totalWeight} onChange={(e) => setTotalWeight(e.target.value)} />
                </FormField>

                <div className="col-span-2 flex gap-3 pt-2 border-t border-gray-100">
                  <Button type="submit" loading={saving} className="flex-1 justify-center">
                    Save Dispatch Info
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add frontend/src/app/(dashboard)/dispatch/ frontend/src/hooks/types.ts frontend/src/hooks/services.tsx
git commit -m "feat: add packing/dispatch page with carrier, tracking, weight management"
```

---

## Task 9: Wire Up + Final Deploy

**Files:**
- `backend/app/models/__init__.py` or `backend/app/main.py` — ensure quality models imported
- Run full deploy

**Step 1: Verify quality model import in main.py**

In `backend/app/main.py`, check that models are imported before `Base.metadata.create_all`. Add if missing:

```python
from app.models import quality  # noqa: F401
```

**Step 2: Push backend and trigger Render deploy**

```bash
git push origin master
```

Wait for Render deploy to succeed.

**Step 3: Deploy frontend to Vercel**

```bash
cd frontend
vercel deploy --prod
```

Wait for build to complete. Expected: all 11 routes including `/quality` and `/dispatch`.

**Step 4: Smoke test checklist**

- [ ] Sidebar is dark navy on all pages
- [ ] Dashboard shows Active Orders / On Hold / Completed Today stats
- [ ] Dashboard shows Stitching Progress and Packing Progress bars
- [ ] Quick action buttons navigate correctly
- [ ] `/quality` — select order → 3 checkpoints appear → toggle pass/fail works → log defect works
- [ ] `/dispatch` — order checklist shows packing_complete orders → fill carrier + generate tracking → save works
- [ ] `/orders`, `/parties`, `/production`, `/ledger` all still work

**Step 5: Final commit if any fixes**

```bash
git add -A
git commit -m "fix: post-deploy smoke test fixes"
git push origin master
```
