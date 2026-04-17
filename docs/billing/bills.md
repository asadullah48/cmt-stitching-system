# Bills Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Bill model that links to an order, auto-numbers in series (A, B, C…), marks the order dispatched, posts an income entry to the party ledger, and tracks payment status.

**Architecture:** New `cmt_bills` table with a 1-to-1 relationship to `cmt_orders`. Creating a bill triggers: order → `dispatched`, inventory out (via existing BOM logic), and a `FinancialTransaction(type="income")` for the party ledger. Recording a payment creates a `FinancialTransaction(type="payment")` and updates `payment_status`. New frontend pages: `/bills` (list), `/bills/new` (create), `/bills/[id]` (detail + print). "Create Bill" button added to Dispatch page.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Pydantic v2 (backend), Next.js 15 + TailwindCSS v4 + React Context (frontend), Alembic for migration, uv for Python packages.

---

## Task 1: Bill Model

**Files:**
- Create: `backend/app/models/bill.py`
- Modify: `backend/app/models/orders.py` (add `bill` relationship)
- Modify: `backend/app/models/parties.py` (add `bills` relationship)
- Modify: `backend/app/models/__init__.py` (export Bill)

**Step 1: Create `backend/app/models/bill.py`**

```python
from sqlalchemy import Column, String, Integer, Numeric, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Bill(BaseModel):
    __tablename__ = "cmt_bills"

    bill_number = Column(String(20), unique=True, nullable=False)   # e.g. "A51", "B07"
    bill_series = Column(String(5), nullable=False)                  # "A", "B"
    bill_sequence = Column(Integer, nullable=False)                  # 51, 7

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=True)

    bill_date = Column(Date, nullable=False)
    carrier = Column(String(50), nullable=True)
    tracking_number = Column(String(100), nullable=True)
    carton_count = Column(Integer, nullable=True)
    total_weight = Column(Numeric(8, 2), nullable=True)

    # payment_status: unpaid | partial | paid
    payment_status = Column(String(20), default="unpaid", nullable=False)
    amount_due = Column(Numeric(10, 2), nullable=False)
    amount_paid = Column(Numeric(10, 2), default=0, nullable=False)

    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    order = relationship("Order", back_populates="bill")
    party = relationship("Party", back_populates="bills")
    creator = relationship("User")
```

**Step 2: Add `bill` relationship to `backend/app/models/orders.py`**

Add to the `Order` relationships block (after the last existing relationship):
```python
bill = relationship("Bill", back_populates="order", uselist=False)
```

**Step 3: Add `bills` relationship to `backend/app/models/parties.py`**

Add to the `Party` relationships block:
```python
bills = relationship("Bill", back_populates="party")
```

**Step 4: Export Bill in `backend/app/models/__init__.py`**

Add:
```python
from .bill import Bill
```

**Step 5: Commit**
```bash
git add backend/app/models/
git commit -m "feat: add Bill model"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\h8c9d0e1f2g3_add_bills_table.py`

**Step 1: Create the migration file** (use ABSOLUTE path as required by project convention)

```python
"""add bills table

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-03-12

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'h8c9d0e1f2g3'
down_revision = 'g7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cmt_bills',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('bill_number', sa.String(20), unique=True, nullable=False),
        sa.Column('bill_series', sa.String(5), nullable=False),
        sa.Column('bill_sequence', sa.Integer(), nullable=False),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=False),
        sa.Column('party_id', UUID(as_uuid=True), sa.ForeignKey('cmt_parties.id'), nullable=True),
        sa.Column('bill_date', sa.Date(), nullable=False),
        sa.Column('carrier', sa.String(50), nullable=True),
        sa.Column('tracking_number', sa.String(100), nullable=True),
        sa.Column('carton_count', sa.Integer(), nullable=True),
        sa.Column('total_weight', sa.Numeric(8, 2), nullable=True),
        sa.Column('payment_status', sa.String(20), nullable=False, server_default='unpaid'),
        sa.Column('amount_due', sa.Numeric(10, 2), nullable=False),
        sa.Column('amount_paid', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_bills_bill_series', 'cmt_bills', ['bill_series'])
    op.create_index('ix_cmt_bills_order_id', 'cmt_bills', ['order_id'])


def downgrade():
    op.drop_index('ix_cmt_bills_order_id', table_name='cmt_bills')
    op.drop_index('ix_cmt_bills_bill_series', table_name='cmt_bills')
    op.drop_table('cmt_bills')
```

**Step 2: Run the migration**
```bash
cd backend
uv run alembic upgrade head
```
Expected: `Running upgrade g7b8c9d0e1f2 -> h8c9d0e1f2g3`

**Step 3: Commit**
```bash
git add backend/alembic/versions/h8c9d0e1f2g3_add_bills_table.py
git commit -m "feat: migration - add cmt_bills table"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/bill.py`

```python
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, model_validator


class PaymentStatus(str, Enum):
    unpaid = "unpaid"
    partial = "partial"
    paid = "paid"


class BillCreate(BaseModel):
    order_id: UUID
    bill_number: Optional[str] = None   # None = auto-generate
    bill_series: str = "A"              # series to use for auto-gen
    bill_date: date
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    amount_due: Decimal
    notes: Optional[str] = None

    @model_validator(mode="after")
    def bill_number_or_series(self):
        # If bill_number is provided manually, strip and validate non-empty
        if self.bill_number is not None:
            self.bill_number = self.bill_number.strip().upper()
            if not self.bill_number:
                raise ValueError("bill_number cannot be blank")
        return self


class BillPaymentUpdate(BaseModel):
    amount: Decimal
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class BillOut(BaseModel):
    id: UUID
    bill_number: str
    bill_series: str
    bill_sequence: int
    order_id: UUID
    order_number: Optional[str] = None
    party_id: Optional[UUID] = None
    party_name: Optional[str] = None
    bill_date: date
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    payment_status: str
    amount_due: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class BillListResponse(BaseModel):
    data: list[BillOut]
    total: int
    page: int
    size: int


class NextBillNumber(BaseModel):
    series: str
    next_number: str
    next_sequence: int
```

**Commit:**
```bash
git add backend/app/schemas/bill.py
git commit -m "feat: bill pydantic schemas"
```

---

## Task 4: Bill Service

**Files:**
- Create: `backend/app/services/bill_service.py`

```python
from datetime import date as date_type
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.orders import Order
from app.models.financial import FinancialTransaction
from app.models.parties import Party
from app.schemas.bill import BillCreate, BillPaymentUpdate
from app.services.audit_service import AuditService


class BillService:

    @staticmethod
    def next_number(db: Session, series: str) -> tuple[str, int]:
        """Return (next_bill_number, next_sequence) for a given series."""
        series = series.strip().upper()
        last = (
            db.query(Bill)
            .filter(Bill.bill_series == series, Bill.is_deleted.is_(False))
            .order_by(Bill.bill_sequence.desc())
            .first()
        )
        seq = (last.bill_sequence + 1) if last else 1
        return f"{series}{seq:02d}", seq

    @staticmethod
    def _parse_manual_number(bill_number: str) -> tuple[str, int]:
        """Parse 'A51' → ('A', 51). Supports multi-char prefixes like 'AB'."""
        i = 0
        while i < len(bill_number) and bill_number[i].isalpha():
            i += 1
        if i == 0 or i == len(bill_number):
            raise ValueError(f"Invalid bill number format: {bill_number}. Expected e.g. A51 or B07")
        series = bill_number[:i].upper()
        try:
            seq = int(bill_number[i:])
        except ValueError:
            raise ValueError(f"Invalid bill number format: {bill_number}")
        return series, seq

    @staticmethod
    def create(db: Session, data: BillCreate, user_id: UUID) -> Bill:
        # 1. Fetch order (with party)
        order = (
            db.query(Order)
            .options(joinedload(Order.party))
            .filter(Order.id == data.order_id, Order.is_deleted.is_(False))
            .first()
        )
        if not order:
            raise ValueError("Order not found")

        # 2. Ensure order has no existing bill
        existing = db.query(Bill).filter(
            Bill.order_id == data.order_id,
            Bill.is_deleted.is_(False)
        ).first()
        if existing:
            raise ValueError(f"Order already has bill {existing.bill_number}")

        # 3. Resolve bill number
        if data.bill_number:
            # Manual: validate uniqueness and parse series/sequence
            dup = db.query(Bill).filter(
                Bill.bill_number == data.bill_number,
                Bill.is_deleted.is_(False)
            ).first()
            if dup:
                raise ValueError(f"Bill number {data.bill_number} already exists")
            series, seq = BillService._parse_manual_number(data.bill_number)
            bill_number = data.bill_number
        else:
            # Auto-generate in chosen series
            bill_number, seq = BillService.next_number(db, data.bill_series)
            series = data.bill_series.upper()

        # 4. Create bill
        bill = Bill(
            bill_number=bill_number,
            bill_series=series,
            bill_sequence=seq,
            order_id=data.order_id,
            party_id=order.party_id,
            bill_date=data.bill_date,
            carrier=data.carrier or order.carrier,
            tracking_number=data.tracking_number or order.tracking_number,
            carton_count=data.carton_count or order.carton_count,
            total_weight=data.total_weight or order.total_weight,
            payment_status="unpaid",
            amount_due=data.amount_due,
            amount_paid=Decimal("0"),
            notes=data.notes,
            created_by=user_id,
        )
        db.add(bill)
        db.flush()

        # 5. Mark order dispatched
        order.status = "dispatched"
        order.dispatch_date = data.bill_date
        order.actual_completion = data.bill_date

        # 6. Post income entry to ledger
        if order.party_id:
            txn = FinancialTransaction(
                party_id=order.party_id,
                order_id=order.id,
                transaction_type="income",
                amount=data.amount_due,
                reference_number=bill_number,
                description=f"Bill #{bill_number} — {order.goods_description}",
                transaction_date=data.bill_date,
                created_by=user_id,
            )
            db.add(txn)
            db.flush()
            # Update party balance
            party = db.query(Party).filter(Party.id == order.party_id).with_for_update().first()
            if party:
                party.balance += data.amount_due

        AuditService.log_create(
            db, "cmt_bills", bill.id,
            {"bill_number": bill_number, "amount_due": str(data.amount_due)},
            user_id,
        )
        db.commit()
        db.refresh(bill)
        return bill

    @staticmethod
    def record_payment(db: Session, bill_id: UUID, data: BillPaymentUpdate, user_id: UUID) -> Bill:
        bill = (
            db.query(Bill)
            .options(joinedload(Bill.order))
            .filter(Bill.id == bill_id, Bill.is_deleted.is_(False))
            .first()
        )
        if not bill:
            raise ValueError("Bill not found")
        if bill.payment_status == "paid":
            raise ValueError("Bill is already fully paid")

        outstanding = bill.amount_due - bill.amount_paid
        amount = min(data.amount, outstanding)

        # Create payment transaction
        txn = FinancialTransaction(
            party_id=bill.party_id,
            order_id=bill.order_id,
            transaction_type="payment",
            amount=amount,
            payment_method=data.payment_method,
            reference_number=bill.bill_number,
            description=data.notes or f"Payment for Bill #{bill.bill_number}",
            transaction_date=date_type.today(),
            created_by=user_id,
        )
        db.add(txn)
        db.flush()

        # Update party balance
        if bill.party_id:
            party = db.query(Party).filter(Party.id == bill.party_id).with_for_update().first()
            if party:
                party.balance -= amount

        # Update bill
        bill.amount_paid += amount
        if bill.amount_paid >= bill.amount_due:
            bill.payment_status = "paid"
        else:
            bill.payment_status = "partial"

        db.commit()
        db.refresh(bill)
        return bill

    @staticmethod
    def get_all(
        db: Session,
        page: int = 1,
        size: int = 20,
        series: Optional[str] = None,
        party_id: Optional[UUID] = None,
        payment_status: Optional[str] = None,
        date_from: Optional[date_type] = None,
        date_to: Optional[date_type] = None,
    ) -> tuple[list[Bill], int]:
        q = (
            db.query(Bill)
            .options(joinedload(Bill.order), joinedload(Bill.party))
            .filter(Bill.is_deleted.is_(False))
        )
        if series:
            q = q.filter(Bill.bill_series == series.upper())
        if party_id:
            q = q.filter(Bill.party_id == party_id)
        if payment_status:
            q = q.filter(Bill.payment_status == payment_status)
        if date_from:
            q = q.filter(Bill.bill_date >= date_from)
        if date_to:
            q = q.filter(Bill.bill_date <= date_to)
        total = q.count()
        bills = q.order_by(Bill.bill_date.desc(), Bill.bill_sequence.desc()).offset((page - 1) * size).limit(size).all()
        return bills, total

    @staticmethod
    def get_by_id(db: Session, bill_id: UUID) -> Optional[Bill]:
        return (
            db.query(Bill)
            .options(joinedload(Bill.order).joinedload(Order.items), joinedload(Bill.party))
            .filter(Bill.id == bill_id, Bill.is_deleted.is_(False))
            .first()
        )
```

**Commit:**
```bash
git add backend/app/services/bill_service.py
git commit -m "feat: bill service - create, payment, list, next-number"
```

---

## Task 5: API Endpoint

**Files:**
- Create: `backend/app/api/v1/endpoints/bills.py`
- Modify: `backend/app/api/v1/router.py`

**Step 1: Create `backend/app/api/v1/endpoints/bills.py`**

```python
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import CurrentUser, DbDep
from app.schemas.bill import BillCreate, BillOut, BillListResponse, BillPaymentUpdate, NextBillNumber
from app.services.bill_service import BillService

router = APIRouter(prefix="/bills", tags=["bills"])


def _to_out(bill) -> BillOut:
    return BillOut(
        id=bill.id,
        bill_number=bill.bill_number,
        bill_series=bill.bill_series,
        bill_sequence=bill.bill_sequence,
        order_id=bill.order_id,
        order_number=bill.order.order_number if bill.order else None,
        party_id=bill.party_id,
        party_name=bill.party.name if bill.party else None,
        bill_date=bill.bill_date,
        carrier=bill.carrier,
        tracking_number=bill.tracking_number,
        carton_count=bill.carton_count,
        total_weight=bill.total_weight,
        payment_status=bill.payment_status,
        amount_due=bill.amount_due,
        amount_paid=bill.amount_paid,
        amount_outstanding=bill.amount_due - bill.amount_paid,
        notes=bill.notes,
    )


@router.get("/next-number", response_model=NextBillNumber)
def get_next_number(db: DbDep, _: CurrentUser, series: str = Query("A")):
    next_num, seq = BillService.next_number(db, series)
    return NextBillNumber(series=series.upper(), next_number=next_num, next_sequence=seq)


@router.get("/", response_model=BillListResponse)
def list_bills(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    series: Optional[str] = Query(None),
    party_id: Optional[UUID] = Query(None),
    payment_status: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    bills, total = BillService.get_all(db, page, size, series, party_id, payment_status, date_from, date_to)
    return BillListResponse(data=[_to_out(b) for b in bills], total=total, page=page, size=size)


@router.post("/", response_model=BillOut, status_code=201)
def create_bill(data: BillCreate, db: DbDep, current_user: CurrentUser):
    try:
        bill = BillService.create(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_out(bill)


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(bill_id: UUID, db: DbDep, _: CurrentUser):
    bill = BillService.get_by_id(db, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _to_out(bill)


@router.patch("/{bill_id}/payment", response_model=BillOut)
def record_payment(bill_id: UUID, data: BillPaymentUpdate, db: DbDep, current_user: CurrentUser):
    try:
        bill = BillService.record_payment(db, bill_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _to_out(bill)
```

**Step 2: Register in `backend/app/api/v1/router.py`**

Add import:
```python
from .endpoints.bills import router as bills_router
```

Add to router:
```python
api_router.include_router(bills_router)
```

**Step 3: Commit**
```bash
git add backend/app/api/v1/endpoints/bills.py backend/app/api/v1/router.py
git commit -m "feat: bills API endpoint"
```

---

## Task 6: Frontend Types & Services

**Files:**
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

**Step 1: Add Bill types and service functions to BOTH `services.ts` and `services.tsx`**

Add these types near the top (after existing types):
```typescript
export interface Bill {
  id: string;
  bill_number: string;
  bill_series: string;
  bill_sequence: number;
  order_id: string;
  order_number?: string;
  party_id?: string;
  party_name?: string;
  bill_date: string;
  carrier?: string;
  tracking_number?: string;
  carton_count?: number;
  total_weight?: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  amount_due: number;
  amount_paid: number;
  amount_outstanding: number;
  notes?: string;
}

export interface BillCreate {
  order_id: string;
  bill_number?: string;
  bill_series?: string;
  bill_date: string;
  carrier?: string;
  tracking_number?: string;
  carton_count?: number;
  total_weight?: number;
  amount_due: number;
  notes?: string;
}

export interface BillPaymentUpdate {
  amount: number;
  payment_method?: string;
  notes?: string;
}
```

Add these service functions (in the `billService` object):
```typescript
export const billService = {
  list: (params?: Record<string, string | number | undefined>) =>
    apiRequest<{ data: Bill[]; total: number; page: number; size: number }>(
      '/bills/?' + new URLSearchParams(
        Object.entries(params || {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    ),

  getById: (id: string) =>
    apiRequest<Bill>(`/bills/${id}`),

  create: (data: BillCreate) =>
    apiRequest<Bill>('/bills/', { method: 'POST', body: JSON.stringify(data) }),

  recordPayment: (id: string, data: BillPaymentUpdate) =>
    apiRequest<Bill>(`/bills/${id}/payment`, { method: 'PATCH', body: JSON.stringify(data) }),

  nextNumber: (series: string) =>
    apiRequest<{ series: string; next_number: string; next_sequence: number }>(
      `/bills/next-number?series=${series}`
    ),
};
```

**Step 2: Commit**
```bash
git add frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: bill service + types (frontend)"
```

---

## Task 7: Bills List Page (`/bills`)

**Files:**
- Create: `frontend/src/app/(dashboard)/bills/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx` (add Bills nav item)

**Step 1: Create `frontend/src/app/(dashboard)/bills/page.tsx`**

```tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { billService, Bill } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export default function BillsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterSeries, setFilterSeries] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await billService.list({
        page,
        size: 20,
        series: filterSeries || undefined,
        payment_status: filterStatus || undefined,
      });
      setBills(res.data);
      setTotal(res.total);
    } catch {
      showToast("Failed to load bills", "error");
    } finally {
      setLoading(false);
    }
  }, [page, filterSeries, filterStatus, showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bills</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} bills total</p>
        </div>
        <button
          onClick={() => router.push("/bills/new")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + New Bill
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterSeries}
          onChange={e => { setFilterSeries(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Series</option>
          {["A", "B", "C", "D"].map(s => (
            <option key={s} value={s}>Series {s}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Bill #", "Order #", "Party", "Date", "Amount Due", "Paid", "Outstanding", "Status", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">No bills found</td>
              </tr>
            ) : bills.map(bill => (
              <tr key={bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/bills/${bill.id}`)}>
                <td className="px-4 py-3 font-semibold text-blue-600">{bill.bill_number}</td>
                <td className="px-4 py-3 text-gray-600">{bill.order_number}</td>
                <td className="px-4 py-3 text-gray-700">{bill.party_name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{bill.bill_date}</td>
                <td className="px-4 py-3 font-medium">PKR {Number(bill.amount_due).toLocaleString()}</td>
                <td className="px-4 py-3 text-green-700">PKR {Number(bill.amount_paid).toLocaleString()}</td>
                <td className="px-4 py-3 text-red-700">PKR {Number(bill.amount_outstanding).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[bill.payment_status]}`}>
                    {bill.payment_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={e => { e.stopPropagation(); router.push(`/bills/${bill.id}`); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-end gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">← Prev</button>
          <span className="px-3 py-1.5 text-sm text-gray-600">Page {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add Bills nav item to `frontend/src/app/(dashboard)/layout.tsx`**

In the `NAV_ITEMS` array, add after the Ledger entry:
```tsx
{ label: "Bills", href: "/bills", icon: <IconBill /> },
```

Add the icon function above the `NAV_ITEMS` array:
```tsx
function IconBill() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
```

**Step 3: Commit**
```bash
git add frontend/src/app/(dashboard)/bills/ frontend/src/app/(dashboard)/layout.tsx
git commit -m "feat: bills list page + nav item"
```

---

## Task 8: New Bill Form (`/bills/new`)

**Files:**
- Create: `frontend/src/app/(dashboard)/bills/new/page.tsx`

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { billService, orderService, BillCreate } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

export default function NewBillPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<{ id: string; order_number: string; party_name?: string; total_quantity: number; stitch_rate_party: number; pack_rate_party?: number }[]>([]);
  const [autoMode, setAutoMode] = useState(true);
  const [nextNumber, setNextNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<BillCreate>({
    order_id: params.get("order") || "",
    bill_number: "",
    bill_series: "A",
    bill_date: new Date().toISOString().split("T")[0],
    amount_due: 0,
  });

  // Load completed/packing_complete orders without bills
  useEffect(() => {
    orderService.list({ size: 200, status: "packing_complete" })
      .then(res => setOrders(res.data))
      .catch(() => {});
  }, []);

  // Fetch next number when series changes
  useEffect(() => {
    if (!autoMode) return;
    billService.nextNumber(form.bill_series!)
      .then(res => setNextNumber(res.next_number))
      .catch(() => {});
  }, [form.bill_series, autoMode]);

  // Auto-calculate amount_due when order is selected
  useEffect(() => {
    if (!form.order_id) return;
    const order = orders.find(o => o.id === form.order_id);
    if (!order) return;
    const stitch = Number(order.stitch_rate_party) * order.total_quantity;
    const pack = order.pack_rate_party ? Number(order.pack_rate_party) * order.total_quantity : 0;
    setForm(f => ({ ...f, amount_due: stitch + pack }));
  }, [form.order_id, orders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: BillCreate = {
        ...form,
        bill_number: autoMode ? undefined : form.bill_number,
      };
      const bill = await billService.create(payload);
      showToast(`Bill ${bill.bill_number} created`, "success");
      router.push(`/bills/${bill.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create bill";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (k: keyof BillCreate, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Bill</h1>
        <p className="text-sm text-gray-500 mt-0.5">Creates dispatch record, updates ledger & marks order complete</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* Order */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Order *</label>
          <select required value={form.order_id} onChange={e => set("order_id", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Select an order...</option>
            {orders.map(o => (
              <option key={o.id} value={o.id}>
                {o.order_number} — {o.party_name ?? "No party"}
              </option>
            ))}
          </select>
        </div>

        {/* Bill Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Bill Number *</label>
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={autoMode} onChange={() => setAutoMode(true)} /> Auto-generate
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={!autoMode} onChange={() => setAutoMode(false)} /> Manual
            </label>
          </div>
          {autoMode ? (
            <div className="flex gap-3 items-center">
              <select value={form.bill_series} onChange={e => set("bill_series", e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {["A", "B", "C", "D", "E"].map(s => <option key={s} value={s}>Series {s}</option>)}
              </select>
              <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                Will be assigned: <span className="font-semibold text-blue-600">{nextNumber}</span>
              </div>
            </div>
          ) : (
            <input
              type="text"
              placeholder="e.g. A51 or B07"
              value={form.bill_number}
              onChange={e => set("bill_number", e.target.value.toUpperCase())}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase"
              pattern="[A-Za-z]+[0-9]+"
              title="Series letter(s) followed by number, e.g. A51"
            />
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bill Date *</label>
          <input type="date" required value={form.bill_date}
            onChange={e => set("bill_date", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Due (PKR) *</label>
          <input type="number" required min="0" step="0.01" value={form.amount_due}
            onChange={e => set("amount_due", parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-400 mt-1">Auto-calculated from order rates — adjust if needed</p>
        </div>

        {/* Dispatch details (collapsible row) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
            <input type="text" value={form.carrier || ""} onChange={e => set("carrier", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking #</label>
            <input type="text" value={form.tracking_number || ""} onChange={e => set("tracking_number", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cartons</label>
            <input type="number" min="0" value={form.carton_count || ""} onChange={e => set("carton_count", parseInt(e.target.value) || undefined)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
            <input type="number" min="0" step="0.01" value={form.total_weight || ""} onChange={e => set("total_weight", parseFloat(e.target.value) || undefined)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea rows={2} value={form.notes || ""} onChange={e => set("notes", e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {submitting ? "Creating..." : "Create Bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Commit:**
```bash
git add frontend/src/app/(dashboard)/bills/new/
git commit -m "feat: new bill form page"
```

---

## Task 9: Bill Detail & Print Page (`/bills/[id]`)

**Files:**
- Create: `frontend/src/app/(dashboard)/bills/[id]/page.tsx`

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { billService, Bill, BillPaymentUpdate } from "@/hooks/services";
import { useToast } from "@/hooks/toast";

const STATUS_STYLES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
};

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState<BillPaymentUpdate>({ amount: 0 });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    billService.getById(id)
      .then(setBill)
      .catch(() => showToast("Bill not found", "error"))
      .finally(() => setLoading(false));
  }, [id, showToast]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill) return;
    setSubmitting(true);
    try {
      const updated = await billService.recordPayment(bill.id, payment);
      setBill(updated);
      setShowPayment(false);
      showToast("Payment recorded", "success");
    } catch {
      showToast("Failed to record payment", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" /></div>;
  if (!bill) return <div className="text-gray-500 text-center py-20">Bill not found</div>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Toolbar (hidden on print) */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <div className="flex gap-2">
          {bill.payment_status !== "paid" && (
            <button onClick={() => setShowPayment(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              Record Payment
            </button>
          )}
          <button onClick={() => window.print()}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Print / PDF
          </button>
        </div>
      </div>

      {/* Bill Document */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 print:shadow-none print:border-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">BILL</h1>
            <p className="text-xl font-semibold text-blue-600 mt-1">#{bill.bill_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">CMT Stitching & Packing</p>
            <p className="text-sm text-gray-500">Date: {bill.bill_date}</p>
            <span className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[bill.payment_status]}`}>
              {bill.payment_status}
            </span>
          </div>
        </div>

        {/* Order & Party */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Bill To</p>
            <p className="font-semibold text-gray-900">{bill.party_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Order Reference</p>
            <p className="font-semibold text-gray-900">{bill.order_number}</p>
          </div>
        </div>

        {/* Dispatch Details */}
        {(bill.carrier || bill.tracking_number || bill.carton_count || bill.total_weight) && (
          <div className="bg-gray-50 rounded-lg p-4 mb-8 grid grid-cols-2 gap-4 text-sm">
            {bill.carrier && <div><span className="text-gray-500">Carrier:</span> <span className="font-medium">{bill.carrier}</span></div>}
            {bill.tracking_number && <div><span className="text-gray-500">Tracking:</span> <span className="font-medium">{bill.tracking_number}</span></div>}
            {bill.carton_count && <div><span className="text-gray-500">Cartons:</span> <span className="font-medium">{bill.carton_count}</span></div>}
            {bill.total_weight && <div><span className="text-gray-500">Weight:</span> <span className="font-medium">{bill.total_weight} kg</span></div>}
          </div>
        )}

        {/* Amounts */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount Due</span>
            <span className="font-semibold">PKR {Number(bill.amount_due).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount Paid</span>
            <span className="font-semibold text-green-600">PKR {Number(bill.amount_paid).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
            <span>Outstanding</span>
            <span className={bill.amount_outstanding > 0 ? "text-red-600" : "text-green-600"}>
              PKR {Number(bill.amount_outstanding).toLocaleString()}
            </span>
          </div>
        </div>

        {bill.notes && (
          <div className="mt-6 text-sm text-gray-500 italic border-t border-gray-100 pt-4">
            {bill.notes}
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:hidden">
          <form onSubmit={handlePayment} className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Record Payment</h3>
            <p className="text-sm text-gray-500">Outstanding: <strong>PKR {Number(bill.amount_outstanding).toLocaleString()}</strong></p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (PKR)</label>
              <input type="number" required min="1" step="0.01" max={bill.amount_outstanding}
                value={payment.amount || ""}
                onChange={e => setPayment(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={payment.payment_method || ""} onChange={e => setPayment(p => ({ ...p, payment_method: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={payment.notes || ""}
                onChange={e => setPayment(p => ({ ...p, notes: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowPayment(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {submitting ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

**Commit:**
```bash
git add frontend/src/app/(dashboard)/bills/[id]/
git commit -m "feat: bill detail + print + payment modal"
```

---

## Task 10: "Create Bill" Button on Dispatch Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/dispatch/page.tsx`

**Step 1: Read the dispatch page first, then add a "Create Bill" button to each ready order row.**

In the dispatch page, find where orders are rendered (likely a table or card per order). Add a button alongside the existing dispatch action:

```tsx
<button
  onClick={() => router.push(`/bills/new?order=${order.id}`)}
  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
>
  Create Bill
</button>
```

Import `useRouter` if not already imported:
```tsx
import { useRouter } from "next/navigation";
```

**Commit:**
```bash
git add frontend/src/app/(dashboard)/dispatch/page.tsx
git commit -m "feat: Create Bill button on dispatch page"
```

---

## Task 11: Deploy

```bash
cd frontend
vercel deploy --prod
```

Expected: Build succeeds, deployment URL printed.

---

## Summary of Changes

| Layer | Files Changed |
|---|---|
| DB | New `cmt_bills` table via migration `h8c9d0e1f2g3` |
| Models | `bill.py` (new), `orders.py` + `parties.py` (relationships) |
| Schemas | `bill.py` (new) |
| Service | `bill_service.py` (new) |
| API | `endpoints/bills.py` (new), `router.py` (register) |
| Frontend | `services.ts/tsx`, `bills/page.tsx`, `bills/new/page.tsx`, `bills/[id]/page.tsx`, `layout.tsx`, `dispatch/page.tsx` |
