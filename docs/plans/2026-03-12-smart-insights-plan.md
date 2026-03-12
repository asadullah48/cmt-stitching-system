# Smart Insights, Personal UI & Data Entry Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rule-based smart insights panel, personal UI with business config, clone order, and CSV bulk import to speed up the Feb 2025 data backlog entry.

**Architecture:** New `/insights` and `/settings` backend endpoints read from the existing `cmt_system_config` key-value table. Insights engine runs 9 checks against live DB data. Frontend adds a dismissable alerts panel on the dashboard, a `/settings` config page, a clone-order flow, and a `/orders/import` CSV upload page.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), Next.js 15 + TailwindCSS v4 + TypeScript (frontend), existing `cmt_system_config` table (no new migrations needed), `xlsx` npm package for Excel parsing.

---

## Task 1: Settings API (Backend)

**Files:**
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/api/v1/endpoints/settings.py`
- Modify: `backend/app/api/v1/router.py`

### Step 1: Create `backend/app/schemas/settings.py`

```python
from typing import Optional
from pydantic import BaseModel


class SettingsOut(BaseModel):
    business_name: str
    owner_name: str
    no_bill_alert_days: int
    goods_on_hold_alert_days: int
    outstanding_alert_days: int
    rate_deviation_pct: int


class SettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    no_bill_alert_days: Optional[int] = None
    goods_on_hold_alert_days: Optional[int] = None
    outstanding_alert_days: Optional[int] = None
    rate_deviation_pct: Optional[int] = None
```

### Step 2: Create `backend/app/api/v1/endpoints/settings.py`

```python
from fastapi import APIRouter
from app.core.deps import CurrentUser, DbDep
from app.models.config import Config
from app.schemas.settings import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULTS = {
    "business_name": "CMT Stitching & Packing",
    "owner_name": "Admin",
    "no_bill_alert_days": "3",
    "goods_on_hold_alert_days": "5",
    "outstanding_alert_days": "30",
    "rate_deviation_pct": "10",
}


def _get(db, key: str) -> str:
    row = db.query(Config).filter(Config.key == key).first()
    return row.value if row else DEFAULTS[key]


def _set(db, key: str, value: str, user_id):
    row = db.query(Config).filter(Config.key == key).first()
    if row:
        row.value = value
        row.updated_by = user_id
    else:
        db.add(Config(key=key, value=value, updated_by=user_id))


@router.get("/", response_model=SettingsOut)
def get_settings(db: DbDep, _: CurrentUser):
    return SettingsOut(
        business_name=_get(db, "business_name"),
        owner_name=_get(db, "owner_name"),
        no_bill_alert_days=int(_get(db, "no_bill_alert_days")),
        goods_on_hold_alert_days=int(_get(db, "goods_on_hold_alert_days")),
        outstanding_alert_days=int(_get(db, "outstanding_alert_days")),
        rate_deviation_pct=int(_get(db, "rate_deviation_pct")),
    )


@router.put("/", response_model=SettingsOut)
def update_settings(data: SettingsUpdate, db: DbDep, current_user: CurrentUser):
    mapping = {
        "business_name": data.business_name,
        "owner_name": data.owner_name,
        "no_bill_alert_days": str(data.no_bill_alert_days) if data.no_bill_alert_days is not None else None,
        "goods_on_hold_alert_days": str(data.goods_on_hold_alert_days) if data.goods_on_hold_alert_days is not None else None,
        "outstanding_alert_days": str(data.outstanding_alert_days) if data.outstanding_alert_days is not None else None,
        "rate_deviation_pct": str(data.rate_deviation_pct) if data.rate_deviation_pct is not None else None,
    }
    for key, val in mapping.items():
        if val is not None:
            _set(db, key, val, current_user.id)
    db.commit()
    return get_settings(db, current_user)
```

### Step 3: Register in `backend/app/api/v1/router.py`

Read the file, then add:
```python
from .endpoints.settings import router as settings_router
api_router.include_router(settings_router)
```

### Step 4: Commit
```bash
git add backend/app/schemas/settings.py backend/app/api/v1/endpoints/settings.py backend/app/api/v1/router.py
git commit -m "feat: settings API - business config + alert thresholds"
```

---

## Task 2: Insights API (Backend)

**Files:**
- Create: `backend/app/api/v1/endpoints/insights.py`
- Modify: `backend/app/api/v1/router.py`

### Step 1: Create `backend/app/api/v1/endpoints/insights.py`

```python
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.bill import Bill
from app.models.config import Config
from app.models.financial import FinancialTransaction
from app.models.inventory import InventoryItem
from app.models.orders import Order
from app.models.parties import Party
from pydantic import BaseModel

router = APIRouter(prefix="/insights", tags=["insights"])


class Alert(BaseModel):
    id: str           # unique key for dismissal
    level: str        # "warning" | "info"
    message: str
    detail: Optional[str] = None
    link: Optional[str] = None


def _cfg(db: Session, key: str, default: str) -> str:
    row = db.query(Config).filter(Config.key == key).first()
    return row.value if row else default


@router.get("/", response_model=list[Alert])
def get_insights(db: DbDep, _: CurrentUser):
    alerts: list[Alert] = []
    today = date.today()

    no_bill_days = int(_cfg(db, "no_bill_alert_days", "3"))
    hold_days = int(_cfg(db, "goods_on_hold_alert_days", "5"))
    outstanding_days = int(_cfg(db, "outstanding_alert_days", "30"))
    rate_dev_pct = int(_cfg(db, "rate_deviation_pct", "10"))

    # ── Check 1: packing_complete orders with no bill older than threshold ──
    cutoff = today - timedelta(days=no_bill_days)
    unbilled = (
        db.query(Order)
        .outerjoin(Bill, (Bill.order_id == Order.id) & Bill.is_deleted.is_(False))
        .filter(
            Order.status == "packing_complete",
            Order.is_deleted.is_(False),
            Bill.id.is_(None),
            func.date(Order.updated_at) <= cutoff,
        )
        .all()
    )
    if unbilled:
        oldest_days = (today - min(o.updated_at.date() for o in unbilled)).days
        alerts.append(Alert(
            id="unbilled_orders",
            level="warning",
            message=f"{len(unbilled)} order(s) packed but not billed",
            detail=f"Oldest is {oldest_days} days overdue",
            link="/dispatch",
        ))

    # ── Check 2: orders pending (goods on hold) longer than threshold ──
    hold_cutoff = today - timedelta(days=hold_days)
    on_hold = (
        db.query(Order)
        .filter(
            Order.status == "pending",
            Order.is_deleted.is_(False),
            func.date(Order.entry_date) <= hold_cutoff,
        )
        .all()
    )
    if on_hold:
        alerts.append(Alert(
            id="goods_on_hold",
            level="warning",
            message=f"{len(on_hold)} order(s) on hold without progress",
            detail=f"Waiting more than {hold_days} days",
            link="/orders",
        ))

    # ── Check 3: missing pack rate (party usually has it) ──
    # For each order without pack rate, check if party's last 5 orders had pack rate
    orders_no_pack = (
        db.query(Order)
        .filter(
            Order.pack_rate_party.is_(None),
            Order.status.notin_(["dispatched"]),
            Order.is_deleted.is_(False),
            Order.party_id.isnot(None),
        )
        .all()
    )
    missing_pack = []
    for order in orders_no_pack:
        last_5 = (
            db.query(Order)
            .filter(
                Order.party_id == order.party_id,
                Order.id != order.id,
                Order.is_deleted.is_(False),
                Order.pack_rate_party.isnot(None),
            )
            .order_by(Order.created_at.desc())
            .limit(5)
            .all()
        )
        if len(last_5) >= 2:
            missing_pack.append(order.order_number)
    if missing_pack:
        alerts.append(Alert(
            id="missing_pack_rate",
            level="warning",
            message=f"{len(missing_pack)} order(s) missing pack rate",
            detail=f"Party usually charged pack rate: {', '.join(missing_pack[:3])}{'…' if len(missing_pack) > 3 else ''}",
            link="/orders",
        ))

    # ── Check 4: rate deviation from party's usual ──
    active_orders = (
        db.query(Order)
        .filter(
            Order.status.notin_(["dispatched"]),
            Order.is_deleted.is_(False),
            Order.party_id.isnot(None),
        )
        .all()
    )
    rate_issues = []
    for order in active_orders:
        last_5_rates = (
            db.query(Order.stitch_rate_party)
            .filter(
                Order.party_id == order.party_id,
                Order.id != order.id,
                Order.is_deleted.is_(False),
            )
            .order_by(Order.created_at.desc())
            .limit(5)
            .all()
        )
        if len(last_5_rates) >= 3:
            avg = sum(float(r[0]) for r in last_5_rates) / len(last_5_rates)
            if avg > 0:
                deviation = abs(float(order.stitch_rate_party) - avg) / avg * 100
                if deviation > rate_dev_pct:
                    rate_issues.append(order.order_number)
    if rate_issues:
        alerts.append(Alert(
            id="rate_deviation",
            level="info",
            message=f"{len(rate_issues)} order(s) have unusual stitch rates",
            detail=f"Rate differs from party average by >{rate_dev_pct}%: {', '.join(rate_issues[:3])}",
            link="/orders",
        ))

    # ── Check 5: outstanding balance > threshold days ──
    outstanding_cutoff = today - timedelta(days=outstanding_days)
    old_bills = (
        db.query(Bill)
        .options(joinedload(Bill.party))
        .filter(
            Bill.payment_status.in_(["unpaid", "partial"]),
            Bill.is_deleted.is_(False),
            Bill.bill_date <= outstanding_cutoff,
        )
        .all()
    )
    if old_bills:
        total_outstanding = sum(float(b.amount_due - b.amount_paid) for b in old_bills)
        party_names = list({b.party.name for b in old_bills if b.party})[:3]
        alerts.append(Alert(
            id="outstanding_balance",
            level="warning",
            message=f"PKR {total_outstanding:,.0f} outstanding for >{outstanding_days} days",
            detail=f"Parties: {', '.join(party_names)}",
            link="/bills",
        ))

    # ── Check 6: inventory items below minimum stock ──
    low_stock = (
        db.query(InventoryItem)
        .filter(
            InventoryItem.is_deleted.is_(False),
            InventoryItem.minimum_stock > 0,
            InventoryItem.current_stock < InventoryItem.minimum_stock,
        )
        .all()
    )
    if low_stock:
        items = [f"{i.name} ({i.current_stock} {i.unit})" for i in low_stock[:3]]
        alerts.append(Alert(
            id="low_stock",
            level="warning",
            message=f"{len(low_stock)} inventory item(s) below minimum",
            detail=", ".join(items) + ("…" if len(low_stock) > 3 else ""),
            link="/inventory",
        ))

    return alerts
```

### Step 2: Register in router.py

Read the file, then add:
```python
from .endpoints.insights import router as insights_router
api_router.include_router(insights_router)
```

### Step 3: Commit
```bash
git add backend/app/api/v1/endpoints/insights.py backend/app/api/v1/router.py
git commit -m "feat: insights API - 6 rule-based checks"
```

---

## Task 3: Dashboard Summary Enhancement (Backend)

**Files:**
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/services/dashboard_service.py`

### Step 1: Read both files, then add these fields to `DashboardSummary` schema

Add to the `DashboardSummary` Pydantic model:
```python
collected_month: Decimal = Decimal("0")
outstanding_total: Decimal = Decimal("0")
orders_this_month: int = 0
```

### Step 2: Add calculations to `dashboard_service.py`

Add inside `DashboardService.get_summary()` before the return statement:

```python
# Monthly collected (payment transactions this calendar month)
collected_month = (
    db.query(func.coalesce(func.sum(FinancialTransaction.amount), 0))
    .filter(
        FinancialTransaction.transaction_type == "payment",
        FinancialTransaction.is_deleted.is_(False),
        func.extract("year", FinancialTransaction.transaction_date) == today.year,
        func.extract("month", FinancialTransaction.transaction_date) == today.month,
    )
    .scalar()
) or Decimal("0.00")

# Total outstanding (all unpaid/partial bills)
from app.models.bill import Bill
outstanding_total = (
    db.query(func.coalesce(
        func.sum(Bill.amount_due - Bill.amount_paid), 0
    ))
    .filter(
        Bill.is_deleted.is_(False),
        Bill.payment_status.in_(["unpaid", "partial"]),
    )
    .scalar()
) or Decimal("0.00")

# Orders created this month
orders_this_month = (
    db.query(func.count(Order.id))
    .filter(
        Order.is_deleted.is_(False),
        func.extract("year", Order.entry_date) == today.year,
        func.extract("month", Order.entry_date) == today.month,
    )
    .scalar()
) or 0
```

Also add to the `DashboardSummary(...)` return call:
```python
collected_month=Decimal(str(collected_month)),
outstanding_total=Decimal(str(outstanding_total)),
orders_this_month=orders_this_month,
```

### Step 3: Commit
```bash
git add backend/app/schemas/dashboard.py backend/app/services/dashboard_service.py
git commit -m "feat: dashboard - add collected_month, outstanding_total, orders_this_month"
```

---

## Task 4: Frontend Services & Types

**Files:**
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

Add to BOTH files:

### Types:
```typescript
export interface Alert {
  id: string;
  level: 'warning' | 'info';
  message: string;
  detail?: string;
  link?: string;
}

export interface AppSettings {
  business_name: string;
  owner_name: string;
  no_bill_alert_days: number;
  goods_on_hold_alert_days: number;
  outstanding_alert_days: number;
  rate_deviation_pct: number;
}
```

### Services (using same axios `api` pattern as existing services):
```typescript
export const insightsService = {
  getAlerts: () => api.get<Alert[]>('/insights/').then(r => r.data),
};

export const settingsService = {
  get: () => api.get<AppSettings>('/settings/').then(r => r.data),
  update: (data: Partial<AppSettings>) => api.put<AppSettings>('/settings/', data).then(r => r.data),
};
```

### Commit:
```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: insights + settings service types (frontend)"
```

---

## Task 5: Settings Page (`/settings`)

**Files:**
- Create: `frontend/src/app/(dashboard)/settings/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx` (add Settings nav item)

### Step 1: Create `frontend/src/app/(dashboard)/settings/page.tsx`

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { settingsService, AppSettings } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [form, setForm] = useState<AppSettings>({
    business_name: "",
    owner_name: "",
    no_bill_alert_days: 3,
    goods_on_hold_alert_days: 5,
    outstanding_alert_days: 30,
    rate_deviation_pct: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService.get().then(setForm).finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.update(form);
      showToast("Settings saved", "success");
    } catch {
      showToast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof AppSettings, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Business info and smart alert thresholds</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Business Info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Business Info</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input type="text" value={form.business_name}
              onChange={e => set("business_name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
            <input type="text" value={form.owner_name}
              onChange={e => set("owner_name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Smart Alert Thresholds</h2>
          <p className="text-xs text-gray-400">These control when the dashboard shows warnings. Adjust as you learn your patterns.</p>

          {[
            { key: "no_bill_alert_days", label: "Packed but not billed (days)", hint: "Alert when order packed > N days with no bill" },
            { key: "goods_on_hold_alert_days", label: "Goods on hold (days)", hint: "Alert when order pending > N days without starting" },
            { key: "outstanding_alert_days", label: "Outstanding payment (days)", hint: "Alert when bill unpaid > N days" },
            { key: "rate_deviation_pct", label: "Rate deviation (%)", hint: "Alert when order rate differs from party average by > N%" },
          ].map(({ key, label, hint }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="number" min="1" value={form[key as keyof AppSettings]}
                onChange={e => set(key as keyof AppSettings, parseInt(e.target.value) || 1)}
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

### Step 2: Add Settings nav item + icon to `frontend/src/app/(dashboard)/layout.tsx`

Read the file first. Add icon function before NAV_ITEMS:
```tsx
function IconSettings() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
```

Add to NAV_ITEMS array at the end:
```tsx
{ label: "Settings", href: "/settings", icon: <IconSettings /> },
```

### Step 3: Commit
```bash
git add "frontend/src/app/(dashboard)/settings/page.tsx" "frontend/src/app/(dashboard)/layout.tsx"
git commit -m "feat: settings page + nav item"
```

---

## Task 6: Smart Insights Panel + Personal Dashboard Header

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`

### Step 1: Read the dashboard page, then make these changes:

**A) Import insightsService, settingsService, Alert, AppSettings:**
```typescript
import { dashboardService, insightsService, settingsService, Alert, AppSettings } from "@/hooks/services";
```

**B) Add state inside DashboardPage:**
```typescript
const [alerts, setAlerts] = useState<Alert[]>([]);
const [settings, setSettings] = useState<AppSettings | null>(null);
const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
  try {
    const today = new Date().toDateString();
    const stored = localStorage.getItem(`dismissed_alerts_${today}`);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
});
```

**C) Add to the useEffect:**
```typescript
useEffect(() => {
  dashboardService.getSummary().then(setSummary).finally(() => setLoading(false));
  insightsService.getAlerts().then(setAlerts).catch(() => {});
  settingsService.get().then(setSettings).catch(() => {});
}, []);
```

**D) Add dismiss handler:**
```typescript
const dismissAlert = (id: string) => {
  const next = [...dismissedAlerts, id];
  setDismissedAlerts(next);
  const today = new Date().toDateString();
  localStorage.setItem(`dismissed_alerts_${today}`, JSON.stringify(next));
};
```

**E) Replace the hardcoded dashboard header div with:**
```tsx
<div className="bg-[#1a2744] rounded-2xl px-6 py-5 flex items-center justify-between">
  <div>
    <h1 className="text-xl font-bold text-white">
      {settings?.business_name ?? "CMT Stitching & Packing"}
    </h1>
    <p className="text-sm text-blue-300 mt-0.5">
      {settings?.owner_name ? `${settings.owner_name} · ` : ""}Live operations overview
    </p>
  </div>
  <div className="text-right text-sm text-blue-200 space-y-0.5">
    <p className="font-semibold text-white">
      PKR {loading ? "…" : formatCurrency(summary?.total_revenue_month ?? 0)}
    </p>
    <p className="text-xs text-blue-300">Billed this month</p>
    <p className="text-xs text-green-300">
      Collected: PKR {loading ? "…" : formatCurrency(summary?.collected_month ?? 0)}
    </p>
    <p className="text-xs text-red-300">
      Outstanding: PKR {loading ? "…" : formatCurrency(summary?.outstanding_total ?? 0)}
    </p>
  </div>
</div>
```

**F) Add Smart Insights panel just after the header div (before stat cards):**
```tsx
{/* Smart Insights */}
{alerts.filter(a => !dismissedAlerts.includes(a.id)).length > 0 && (
  <div className="space-y-2">
    {alerts
      .filter(a => !dismissedAlerts.includes(a.id))
      .map(alert => (
        <div key={alert.id}
          className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 border text-sm
            ${alert.level === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
        >
          <div className="flex items-start gap-2 flex-1">
            <span className="mt-0.5">{alert.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <div>
              <span className="font-semibold">{alert.message}</span>
              {alert.detail && <span className="text-xs opacity-75 ml-2">{alert.detail}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {alert.link && (
              <button onClick={() => router.push(alert.link!)}
                className="text-xs underline opacity-75 hover:opacity-100">View</button>
            )}
            <button onClick={() => dismissAlert(alert.id)}
              className="opacity-50 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        </div>
      ))}
  </div>
)}
```

### Step 2: Commit
```bash
git add "frontend/src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: smart insights panel + personal dashboard header"
```

---

## Task 7: Clone Order Button

**Files:**
- Modify: `frontend/src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `frontend/src/app/(dashboard)/orders/page.tsx` (handle `?clone=<id>` param)

### Step 1: Read both files to understand existing structure.

### Step 2: In `orders/[id]/page.tsx` — add Clone button

Find the action buttons area (where Delete/Edit buttons exist). Add:
```tsx
<button
  onClick={() => router.push(`/orders?clone=${order.id}`)}
  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
>
  Clone Order
</button>
```

Make sure `useRouter` is imported and `router` is defined.

### Step 3: In `orders/page.tsx` — handle `?clone=<id>` to pre-fill new order sheet

Read the file to find where the new order form/sheet is opened. Add this logic:

```typescript
const searchParams = useSearchParams();
const cloneId = searchParams.get("clone");

// After orders load, if cloneId present, find the order and pre-fill form
useEffect(() => {
  if (!cloneId) return;
  ordersService.getById(cloneId).then(order => {
    // pre-fill the new order form state with cloned data
    setNewOrderDefaults({
      party_id: order.party_id,
      goods_description: order.goods_description,
      stitch_rate_party: order.stitch_rate_party,
      stitch_rate_labor: order.stitch_rate_labor,
      pack_rate_party: order.pack_rate_party,
      pack_rate_labor: order.pack_rate_labor,
      product_id: order.product_id,
      items: order.items.map(i => ({ size: i.size, quantity: i.quantity })),
    });
    setShowNewOrder(true); // open the new order sheet
  }).catch(() => {});
}, [cloneId]);
```

Note: Read the file carefully to match the exact state variable names used for the new order form. Adapt accordingly.

### Step 4: Commit
```bash
git add "frontend/src/app/(dashboard)/orders/[id]/page.tsx" "frontend/src/app/(dashboard)/orders/page.tsx"
git commit -m "feat: clone order button - pre-fill new order from existing"
```

---

## Task 8: CSV Bulk Import (Backend)

**Files:**
- Modify: `backend/app/api/v1/endpoints/orders.py`

### Step 1: Read `backend/app/api/v1/endpoints/orders.py` and `backend/app/services/order_service.py`

### Step 2: Add bulk import endpoint to `orders.py`

Add after existing imports:
```python
from app.models.parties import Party as PartyModel
```

Add new endpoint at the end of the file:
```python
class BulkOrderRow(BaseModel):
    order_date: date
    party_name: str
    goods_description: str
    total_quantity: int
    stitch_rate_party: Decimal
    stitch_rate_labor: Decimal
    pack_rate_party: Optional[Decimal] = None
    pack_rate_labor: Optional[Decimal] = None
    delivery_date: Optional[date] = None
    notes: Optional[str] = None
    items: list[OrderItemCreate] = []

class BulkImportResult(BaseModel):
    created: int
    errors: list[dict]

@router.post("/bulk-import", response_model=BulkImportResult, status_code=201)
def bulk_import_orders(rows: list[BulkOrderRow], db: DbDep, current_user: CurrentUser):
    created = 0
    errors = []
    for i, row in enumerate(rows):
        try:
            # Find or create party by name
            party = db.query(PartyModel).filter(
                func.lower(PartyModel.name) == row.party_name.strip().lower(),
                PartyModel.is_deleted.is_(False),
            ).first()
            if not party:
                party = PartyModel(name=row.party_name.strip(), balance=Decimal("0"))
                db.add(party)
                db.flush()

            order_data = OrderCreate(
                party_id=party.id,
                goods_description=row.goods_description,
                total_quantity=row.total_quantity,
                stitch_rate_party=row.stitch_rate_party,
                stitch_rate_labor=row.stitch_rate_labor,
                pack_rate_party=row.pack_rate_party,
                pack_rate_labor=row.pack_rate_labor,
                entry_date=row.order_date,
                delivery_date=row.delivery_date,
                items=row.items if row.items else [OrderItemCreate(size="OS", quantity=row.total_quantity)],
            )
            OrderService.create(db, order_data, current_user.id)
            created += 1
        except Exception as e:
            db.rollback()
            errors.append({"row": i + 1, "party": row.party_name, "reason": str(e)})
    return BulkImportResult(created=created, errors=errors)
```

Also add missing imports at top of file:
```python
from decimal import Decimal
from sqlalchemy import func
from app.schemas.orders import OrderCreate, OrderItemCreate
from app.services.order_service import OrderService
```

### Step 3: Commit
```bash
git add backend/app/api/v1/endpoints/orders.py
git commit -m "feat: bulk import orders endpoint"
```

---

## Task 9: CSV Bulk Import (Frontend)

**Files:**
- Create: `frontend/src/app/(dashboard)/orders/import/page.tsx`

### Step 1: Install xlsx package
```bash
cd frontend && npm install xlsx
```

### Step 2: Create the import page

```tsx
"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/toast";
import { api } from "@/hooks/services";

interface ImportRow {
  order_date: string;
  party_name: string;
  goods_description: string;
  total_quantity: number;
  stitch_rate_party: number;
  stitch_rate_labor: number;
  pack_rate_party?: number;
  pack_rate_labor?: number;
  delivery_date?: string;
  notes?: string;
}

const TEMPLATE_HEADERS = [
  "order_date", "party_name", "goods_description", "total_quantity",
  "stitch_rate_party", "stitch_rate_labor", "pack_rate_party", "pack_rate_labor",
  "delivery_date", "notes"
];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["2025-02-10", "Asad Kapra", "Shirts", 500, 15, 10, 5, 3, "2025-02-20", ""],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  XLSX.writeFile(wb, "cmt_import_template.xlsx");
}

export default function ImportOrdersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { row: number; party: string; reason: string }[] } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false });
      const parsed: ImportRow[] = json.map(row => ({
        order_date: String(row.order_date || "").split("T")[0],
        party_name: String(row.party_name || ""),
        goods_description: String(row.goods_description || ""),
        total_quantity: parseInt(String(row.total_quantity)) || 0,
        stitch_rate_party: parseFloat(String(row.stitch_rate_party)) || 0,
        stitch_rate_labor: parseFloat(String(row.stitch_rate_labor)) || 0,
        pack_rate_party: row.pack_rate_party ? parseFloat(String(row.pack_rate_party)) : undefined,
        pack_rate_labor: row.pack_rate_labor ? parseFloat(String(row.pack_rate_labor)) : undefined,
        delivery_date: row.delivery_date ? String(row.delivery_date).split("T")[0] : undefined,
        notes: row.notes ? String(row.notes) : undefined,
      })).filter(r => r.party_name && r.goods_description);
      setRows(parsed);
      setResult(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    try {
      const payload = rows.map(r => ({
        ...r,
        items: [{ size: "OS", quantity: r.total_quantity }],
      }));
      const res = await api.post<{ created: number; errors: { row: number; party: string; reason: string }[] }>(
        "/orders/bulk-import", payload
      );
      setResult(res.data);
      if (res.data.created > 0) {
        showToast(`${res.data.created} orders imported`, "success");
      }
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bulk import from Excel — for Feb 2025 backlog entry</p>
        </div>
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
      </div>

      {/* Steps */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">How to import</h2>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
          <li>Download the Excel template below</li>
          <li>Fill in your orders (one row per order)</li>
          <li>Upload the filled file</li>
          <li>Review the preview, then click Import</li>
        </ol>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          ⬇ Download Template (.xlsx)
        </button>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Upload File</h2>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-600 file:font-medium hover:file:bg-blue-100" />
        {rows.length > 0 && (
          <p className="text-sm text-green-700 font-medium">{rows.length} rows ready to import</p>
        )}
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">Preview ({rows.length} rows)</h2>
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {importing ? "Importing…" : `Import ${rows.length} Orders`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Date", "Party", "Goods", "Qty", "Stitch Rate", "Pack Rate", "Delivery"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{row.order_date}</td>
                    <td className="px-3 py-2 font-medium">{row.party_name}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate">{row.goods_description}</td>
                    <td className="px-3 py-2">{row.total_quantity}</td>
                    <td className="px-3 py-2">{row.stitch_rate_party}</td>
                    <td className="px-3 py-2">{row.pack_rate_party ?? "—"}</td>
                    <td className="px-3 py-2">{row.delivery_date ?? "—"}</td>
                  </tr>
                ))}
                {rows.length > 20 && (
                  <tr><td colSpan={7} className="px-3 py-2 text-gray-400 text-center">…and {rows.length - 20} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-5 ${result.errors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="font-semibold text-gray-800">{result.created} orders imported successfully</p>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-amber-700">{result.errors.length} row(s) failed:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-600">Row {err.row} ({err.party}): {err.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 3: Commit
```bash
git add "frontend/src/app/(dashboard)/orders/import/"
git commit -m "feat: CSV/Excel bulk import page for orders"
```

---

## Task 10: Deploy

```bash
cd frontend && vercel deploy --prod
```

Expected: Build succeeds, all new routes included:
- `/settings`
- `/orders/import`

---

## Summary

| Task | What it builds |
|---|---|
| 1 | Settings API (business name + thresholds) |
| 2 | Insights API (6 rule checks) |
| 3 | Dashboard stats enhancement (collected + outstanding) |
| 4 | Frontend services for insights + settings |
| 5 | Settings page `/settings` |
| 6 | Smart insights panel + personal header on dashboard |
| 7 | Clone order button |
| 8 | Bulk import backend endpoint |
| 9 | Bulk import frontend page `/orders/import` |
| 10 | Deploy |
