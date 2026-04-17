# Overhead & Cash Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a business overhead expense tracker (rent, wages, utilities) with a hybrid cash-position system (opening balance + transaction-driven running balance for Cash In Hand and Bank accounts).

**Architecture:** Three new tables — `cmt_cash_accounts` (2 rows: Cash + Bank), `cmt_cash_entries` (every debit/credit), `cmt_overhead_expenses` (bills with recurring support). Paying an overhead expense auto-creates a debit cash entry. Frontend `/overhead` page with balance cards + two tabs (Expenses | Cash Ledger). Dashboard gets a Cash Position widget.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2 (backend); Next.js 15 + TailwindCSS v4 + TypeScript (frontend); uv (Python package manager).

---

## Task 1: Backend Models

**Files:**
- Create: `backend/app/models/overhead.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create `backend/app/models/overhead.py`**

```python
from decimal import Decimal
from sqlalchemy import Column, String, Numeric, Date, DateTime, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class CashAccount(BaseModel):
    __tablename__ = "cmt_cash_accounts"

    name = Column(String(100), nullable=False)          # "Cash In Hand" | "Bank"
    account_type = Column(String(10), nullable=False)   # cash | bank
    opening_balance = Column(Numeric(12, 2), default=0, nullable=False)
    note = Column(String(200), nullable=True)           # e.g. bank name / account number

    entries = relationship("CashEntry", back_populates="account")


class CashEntry(BaseModel):
    __tablename__ = "cmt_cash_entries"

    account_id = Column(UUID(as_uuid=True), ForeignKey("cmt_cash_accounts.id"), nullable=False)
    entry_type = Column(String(10), nullable=False)     # credit | debit
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(String(200), nullable=False)
    entry_date = Column(Date, nullable=False)
    source = Column(String(20), nullable=True)          # overhead | manual
    source_id = Column(UUID(as_uuid=True), nullable=True)  # FK to overhead_expense if source=overhead
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    account = relationship("CashAccount", back_populates="entries")
    creator = relationship("User", foreign_keys=[created_by])


class OverheadExpense(BaseModel):
    __tablename__ = "cmt_overhead_expenses"

    title = Column(String(200), nullable=False)
    # rent | wages | utilities | insurance | other
    category = Column(String(20), nullable=False, default="other")
    amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    # unpaid | paid
    status = Column(String(10), nullable=False, default="unpaid")
    paid_date = Column(Date, nullable=True)
    # which account was debited when paid
    paid_from_account_id = Column(UUID(as_uuid=True), ForeignKey("cmt_cash_accounts.id"), nullable=True)
    # recurrence: monthly | weekly | custom | None
    recurrence = Column(String(10), nullable=True)
    recurrence_days = Column(Integer, nullable=True)
    # self-referential: recurring child points back to template
    parent_expense_id = Column(UUID(as_uuid=True), ForeignKey("cmt_overhead_expenses.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    paid_from_account = relationship("CashAccount", foreign_keys=[paid_from_account_id])
    creator = relationship("User", foreign_keys=[created_by])
```

**Step 2: Add imports to `backend/app/models/__init__.py`**

Add after the `from .todos import Todo` line:
```python
from .overhead import CashAccount, CashEntry, OverheadExpense
```

Add to `__all__`:
```python
    "CashAccount",
    "CashEntry",
    "OverheadExpense",
```

**Step 3: Verify**

```bash
cd backend && uv run python -c "from app.models.overhead import CashAccount, CashEntry, OverheadExpense; print('OK')"
```

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/app/models/overhead.py backend/app/models/__init__.py
git commit -m "feat: add CashAccount, CashEntry, OverheadExpense models"
```

---

## Task 2: Alembic Migration

**Files:**
- Create (ABSOLUTE PATH): `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\o5j6k7l8m9n0_add_overhead_tables.py`

**Step 1: Create the migration file**

```python
"""add overhead and cash tables

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'o5j6k7l8m9n0'
down_revision = 'n4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    # ── Cash Accounts ──────────────────────────────────────────────────────────
    op.create_table(
        'cmt_cash_accounts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('account_type', sa.String(10), nullable=False),
        sa.Column('opening_balance', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('note', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )

    # ── Cash Entries ───────────────────────────────────────────────────────────
    op.create_table(
        'cmt_cash_entries',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('cmt_cash_accounts.id'), nullable=False),
        sa.Column('entry_type', sa.String(10), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('description', sa.String(200), nullable=False),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('source', sa.String(20), nullable=True),
        sa.Column('source_id', UUID(as_uuid=True), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_cash_entries_account_id', 'cmt_cash_entries', ['account_id'])
    op.create_index('ix_cmt_cash_entries_entry_date', 'cmt_cash_entries', ['entry_date'])

    # ── Overhead Expenses ──────────────────────────────────────────────────────
    op.create_table(
        'cmt_overhead_expenses',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('category', sa.String(20), nullable=False, server_default='other'),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='unpaid'),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('paid_from_account_id', UUID(as_uuid=True), sa.ForeignKey('cmt_cash_accounts.id'), nullable=True),
        sa.Column('recurrence', sa.String(10), nullable=True),
        sa.Column('recurrence_days', sa.Integer(), nullable=True),
        sa.Column('parent_expense_id', UUID(as_uuid=True), sa.ForeignKey('cmt_overhead_expenses.id'), nullable=True),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_overhead_expenses_status', 'cmt_overhead_expenses', ['status'])
    op.create_index('ix_cmt_overhead_expenses_due_date', 'cmt_overhead_expenses', ['due_date'])


def downgrade():
    op.drop_index('ix_cmt_overhead_expenses_due_date', table_name='cmt_overhead_expenses')
    op.drop_index('ix_cmt_overhead_expenses_status', table_name='cmt_overhead_expenses')
    op.drop_table('cmt_overhead_expenses')
    op.drop_index('ix_cmt_cash_entries_entry_date', table_name='cmt_cash_entries')
    op.drop_index('ix_cmt_cash_entries_account_id', table_name='cmt_cash_entries')
    op.drop_table('cmt_cash_entries')
    op.drop_table('cmt_cash_accounts')
```

**Step 2: Run the migration**

```bash
cd backend && uv run python -m alembic upgrade head
```

Expected: `Running upgrade n4i5j6k7l8m9 -> o5j6k7l8m9n0, add overhead and cash tables`

**Step 3: Seed the two default cash accounts**

After migration succeeds, seed the two accounts. Create a one-off script `backend/seed_cash_accounts.py`:

```python
"""Run once to create the two default cash accounts."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.overhead import CashAccount

db = SessionLocal()
try:
    existing = db.query(CashAccount).filter(CashAccount.is_deleted == False).count()
    if existing == 0:
        db.add(CashAccount(name="Cash In Hand", account_type="cash", opening_balance=0))
        db.add(CashAccount(name="Bank", account_type="bank", opening_balance=0))
        db.commit()
        print("Seeded: Cash In Hand + Bank accounts")
    else:
        print(f"Skipped: {existing} account(s) already exist")
finally:
    db.close()
```

Run it:
```bash
cd backend && uv run python seed_cash_accounts.py
```

Expected: `Seeded: Cash In Hand + Bank accounts`

**Step 4: Commit**

```bash
git add backend/alembic/versions/o5j6k7l8m9n0_add_overhead_tables.py backend/seed_cash_accounts.py
git commit -m "feat: add overhead/cash migration + seed default accounts"
```

---

## Task 3: Backend Schemas

**Files:**
- Create: `backend/app/schemas/overhead.py`

**Step 1: Create the schemas file**

```python
# backend/app/schemas/overhead.py
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ── Enums ──────────────────────────────────────────────────────────────────────

class OverheadCategory(str, Enum):
    rent = "rent"
    wages = "wages"
    utilities = "utilities"
    insurance = "insurance"
    other = "other"


class OverheadRecurrence(str, Enum):
    monthly = "monthly"
    weekly = "weekly"
    custom = "custom"


class EntryType(str, Enum):
    credit = "credit"
    debit = "debit"


# ── Cash Account ───────────────────────────────────────────────────────────────

class CashAccountUpdate(BaseModel):
    opening_balance: Optional[Decimal] = None
    note: Optional[str] = None


class CashAccountOut(BaseModel):
    id: UUID
    name: str
    account_type: str
    opening_balance: Decimal
    current_balance: Decimal   # computed by endpoint
    note: Optional[str]
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Cash Entry ─────────────────────────────────────────────────────────────────

class CashEntryCreate(BaseModel):
    account_id: UUID
    entry_type: EntryType
    amount: Decimal
    description: str
    entry_date: date
    source: Optional[str] = "manual"


class CashEntryOut(BaseModel):
    id: UUID
    account_id: UUID
    account_name: Optional[str] = None
    entry_type: str
    amount: Decimal
    description: str
    entry_date: date
    source: Optional[str]
    source_id: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class CashEntryListResponse(BaseModel):
    data: list[CashEntryOut]
    total: int
    running_balance: Decimal   # balance after last entry in this page


# ── Overhead Expense ───────────────────────────────────────────────────────────

class OverheadExpenseCreate(BaseModel):
    title: str
    category: OverheadCategory = OverheadCategory.other
    amount: Decimal
    due_date: date
    description: Optional[str] = None
    recurrence: Optional[OverheadRecurrence] = None
    recurrence_days: Optional[int] = None


class OverheadExpenseUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[OverheadCategory] = None
    amount: Optional[Decimal] = None
    due_date: Optional[date] = None
    description: Optional[str] = None
    recurrence: Optional[OverheadRecurrence] = None
    recurrence_days: Optional[int] = None


class MarkPaidRequest(BaseModel):
    account_id: UUID   # which cash account to debit
    paid_date: Optional[date] = None  # defaults to today


class OverheadExpenseOut(BaseModel):
    id: UUID
    title: str
    category: str
    amount: Decimal
    due_date: date
    description: Optional[str]
    status: str
    paid_date: Optional[date]
    paid_from_account_id: Optional[UUID]
    paid_from_account_name: Optional[str] = None
    recurrence: Optional[str]
    recurrence_days: Optional[int]
    parent_expense_id: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class OverheadExpenseListResponse(BaseModel):
    data: list[OverheadExpenseOut]
    total: int
```

**Step 2: Verify**

```bash
cd backend && uv run python -c "from app.schemas.overhead import OverheadExpenseCreate, CashAccountOut; print('OK')"
```

**Step 3: Commit**

```bash
git add backend/app/schemas/overhead.py
git commit -m "feat: add overhead/cash pydantic schemas"
```

---

## Task 4: Backend Endpoint

**Files:**
- Create: `backend/app/api/v1/endpoints/overhead.py`

**Step 1: Create the endpoint**

```python
# backend/app/api/v1/endpoints/overhead.py
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func

from app.core.deps import CurrentUser, DbDep
from app.models.overhead import CashAccount, CashEntry, OverheadExpense
from app.schemas.overhead import (
    CashAccountOut, CashAccountUpdate,
    CashEntryCreate, CashEntryOut, CashEntryListResponse,
    OverheadExpenseCreate, OverheadExpenseUpdate, MarkPaidRequest,
    OverheadExpenseOut, OverheadExpenseListResponse,
)

router = APIRouter(prefix="/overhead", tags=["overhead"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _compute_balance(db, account: CashAccount) -> Decimal:
    credits = db.query(func.coalesce(func.sum(CashEntry.amount), 0)).filter(
        CashEntry.account_id == account.id,
        CashEntry.entry_type == "credit",
        CashEntry.is_deleted == False,
    ).scalar()
    debits = db.query(func.coalesce(func.sum(CashEntry.amount), 0)).filter(
        CashEntry.account_id == account.id,
        CashEntry.entry_type == "debit",
        CashEntry.is_deleted == False,
    ).scalar()
    return Decimal(str(account.opening_balance)) + Decimal(str(credits)) - Decimal(str(debits))


def _account_out(db, account: CashAccount) -> CashAccountOut:
    return CashAccountOut(
        id=account.id,
        name=account.name,
        account_type=account.account_type,
        opening_balance=account.opening_balance,
        current_balance=_compute_balance(db, account),
        note=account.note,
        updated_at=account.updated_at,
    )


def _entry_out(entry: CashEntry) -> CashEntryOut:
    return CashEntryOut(
        id=entry.id,
        account_id=entry.account_id,
        account_name=entry.account.name if entry.account else None,
        entry_type=entry.entry_type,
        amount=entry.amount,
        description=entry.description,
        entry_date=entry.entry_date,
        source=entry.source,
        source_id=entry.source_id,
        created_at=entry.created_at,
    )


def _expense_out(exp: OverheadExpense) -> OverheadExpenseOut:
    return OverheadExpenseOut(
        id=exp.id,
        title=exp.title,
        category=exp.category,
        amount=exp.amount,
        due_date=exp.due_date,
        description=exp.description,
        status=exp.status,
        paid_date=exp.paid_date,
        paid_from_account_id=exp.paid_from_account_id,
        paid_from_account_name=exp.paid_from_account.name if exp.paid_from_account else None,
        recurrence=exp.recurrence,
        recurrence_days=exp.recurrence_days,
        parent_expense_id=exp.parent_expense_id,
        created_at=exp.created_at,
    )


def _spawn_next_expense(db, exp: OverheadExpense) -> None:
    """Auto-create next recurring overhead expense after one is paid."""
    if not exp.recurrence:
        return
    if exp.recurrence == "monthly":
        next_due = exp.due_date + timedelta(days=30)
    elif exp.recurrence == "weekly":
        next_due = exp.due_date + timedelta(weeks=1)
    elif exp.recurrence == "custom" and exp.recurrence_days:
        next_due = exp.due_date + timedelta(days=exp.recurrence_days)
    else:
        return

    db.add(OverheadExpense(
        title=exp.title,
        category=exp.category,
        amount=exp.amount,
        due_date=next_due,
        description=exp.description,
        status="unpaid",
        recurrence=exp.recurrence,
        recurrence_days=exp.recurrence_days,
        parent_expense_id=exp.id,
        created_by=exp.created_by,
    ))


# ── Cash Accounts ──────────────────────────────────────────────────────────────

@router.get("/accounts", response_model=list[CashAccountOut])
def list_accounts(db: DbDep, _: CurrentUser):
    accounts = db.query(CashAccount).filter(CashAccount.is_deleted == False).all()
    return [_account_out(db, a) for a in accounts]


@router.patch("/accounts/{account_id}", response_model=CashAccountOut)
def update_account(account_id: UUID, payload: CashAccountUpdate, db: DbDep, _: CurrentUser):
    acct = db.query(CashAccount).filter(CashAccount.id == account_id, CashAccount.is_deleted == False).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(acct, field, value)
    db.commit()
    db.refresh(acct)
    return _account_out(db, acct)


# ── Cash Entries ───────────────────────────────────────────────────────────────

@router.get("/entries", response_model=CashEntryListResponse)
def list_entries(
    db: DbDep,
    _: CurrentUser,
    account_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    q = db.query(CashEntry).filter(CashEntry.is_deleted == False)
    if account_id:
        q = q.filter(CashEntry.account_id == account_id)
    total = q.count()
    entries = q.order_by(CashEntry.entry_date.desc(), CashEntry.created_at.desc()) \
               .offset((page - 1) * size).limit(size).all()

    # Compute running balance for the filtered account
    running = Decimal("0")
    if account_id:
        acct = db.query(CashAccount).filter(CashAccount.id == account_id).first()
        if acct:
            running = _compute_balance(db, acct)

    return CashEntryListResponse(
        data=[_entry_out(e) for e in entries],
        total=total,
        running_balance=running,
    )


@router.post("/entries", response_model=CashEntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(payload: CashEntryCreate, db: DbDep, current_user: CurrentUser):
    acct = db.query(CashAccount).filter(CashAccount.id == payload.account_id, CashAccount.is_deleted == False).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    entry = CashEntry(
        account_id=payload.account_id,
        entry_type=payload.entry_type.value,
        amount=payload.amount,
        description=payload.description,
        entry_date=payload.entry_date,
        source=payload.source or "manual",
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: UUID, db: DbDep, _: CurrentUser):
    from datetime import datetime
    entry = db.query(CashEntry).filter(CashEntry.id == entry_id, CashEntry.is_deleted == False).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.is_deleted = True
    entry.deleted_at = datetime.utcnow()
    db.commit()


# ── Overhead Expenses ──────────────────────────────────────────────────────────

@router.get("/expenses", response_model=OverheadExpenseListResponse)
def list_expenses(
    db: DbDep,
    _: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    q = db.query(OverheadExpense).filter(OverheadExpense.is_deleted == False)
    if status_filter:
        q = q.filter(OverheadExpense.status == status_filter)
    if category:
        q = q.filter(OverheadExpense.category == category)
    total = q.count()
    expenses = q.order_by(OverheadExpense.due_date.asc()).offset((page - 1) * size).limit(size).all()
    return OverheadExpenseListResponse(data=[_expense_out(e) for e in expenses], total=total)


@router.post("/expenses", response_model=OverheadExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(payload: OverheadExpenseCreate, db: DbDep, current_user: CurrentUser):
    exp = OverheadExpense(
        title=payload.title,
        category=payload.category.value,
        amount=payload.amount,
        due_date=payload.due_date,
        description=payload.description,
        status="unpaid",
        recurrence=payload.recurrence.value if payload.recurrence else None,
        recurrence_days=payload.recurrence_days,
        created_by=current_user.id,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _expense_out(exp)


@router.patch("/expenses/{expense_id}", response_model=OverheadExpenseOut)
def update_expense(expense_id: UUID, payload: OverheadExpenseUpdate, db: DbDep, _: CurrentUser):
    exp = db.query(OverheadExpense).filter(OverheadExpense.id == expense_id, OverheadExpense.is_deleted == False).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exp, field, value.value if hasattr(value, 'value') else value)
    db.commit()
    db.refresh(exp)
    return _expense_out(exp)


@router.patch("/expenses/{expense_id}/pay", response_model=OverheadExpenseOut)
def pay_expense(expense_id: UUID, payload: MarkPaidRequest, db: DbDep, current_user: CurrentUser):
    """Mark an overhead expense as paid, debit the chosen cash account, spawn next if recurring."""
    from datetime import datetime
    exp = db.query(OverheadExpense).filter(OverheadExpense.id == expense_id, OverheadExpense.is_deleted == False).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")

    acct = db.query(CashAccount).filter(CashAccount.id == payload.account_id, CashAccount.is_deleted == False).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Cash account not found")

    paid_on = payload.paid_date or date.today()

    # Mark paid
    exp.status = "paid"
    exp.paid_date = paid_on
    exp.paid_from_account_id = payload.account_id

    # Debit the cash account
    entry = CashEntry(
        account_id=payload.account_id,
        entry_type="debit",
        amount=exp.amount,
        description=f"Paid: {exp.title}",
        entry_date=paid_on,
        source="overhead",
        source_id=exp.id,
        created_by=current_user.id,
    )
    db.add(entry)

    # Spawn next recurring instance
    _spawn_next_expense(db, exp)

    db.commit()
    db.refresh(exp)
    return _expense_out(exp)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: UUID, db: DbDep, _: CurrentUser):
    from datetime import datetime
    exp = db.query(OverheadExpense).filter(OverheadExpense.id == expense_id, OverheadExpense.is_deleted == False).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    exp.is_deleted = True
    exp.deleted_at = datetime.utcnow()
    db.commit()
```

**Step 2: Verify import**

```bash
cd backend && uv run python -c "from app.api.v1.endpoints.overhead import router; print('OK')"
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/endpoints/overhead.py
git commit -m "feat: add overhead/cash REST endpoint"
```

---

## Task 5: Register Router

**Files:**
- Modify: `backend/app/api/v1/router.py`

**Step 1: Read the file, then add**

Import line (after last import):
```python
from .endpoints.overhead import router as overhead_router
```

Register line (after last include_router):
```python
api_router.include_router(overhead_router)
```

**Step 2: Verify**

```bash
cd backend && uv run python -c "from app.api.v1.router import api_router; print('OK')"
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/router.py
git commit -m "feat: register overhead router"
```

---

## Task 6: Frontend Types + Services

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx`

**Step 1: Append to `frontend/src/hooks/types.ts`**

```typescript
// ─── Overhead & Cash ─────────────────────────────────────────────────────────

export type OverheadCategory = "rent" | "wages" | "utilities" | "insurance" | "other";
export type OverheadRecurrence = "monthly" | "weekly" | "custom";
export type OverheadStatus = "unpaid" | "paid";
export type CashEntryType = "credit" | "debit";

export interface CashAccount {
  id: string;
  name: string;
  account_type: "cash" | "bank";
  opening_balance: number;
  current_balance: number;
  note: string | null;
  updated_at: string;
}

export interface CashAccountUpdate {
  opening_balance?: number;
  note?: string;
}

export interface CashEntry {
  id: string;
  account_id: string;
  account_name: string | null;
  entry_type: CashEntryType;
  amount: number;
  description: string;
  entry_date: string;
  source: string | null;
  source_id: string | null;
  created_at: string;
}

export interface CashEntryCreate {
  account_id: string;
  entry_type: CashEntryType;
  amount: number;
  description: string;
  entry_date: string;
  source?: string;
}

export interface CashEntryListResponse {
  data: CashEntry[];
  total: number;
  running_balance: number;
}

export interface OverheadExpense {
  id: string;
  title: string;
  category: OverheadCategory;
  amount: number;
  due_date: string;
  description: string | null;
  status: OverheadStatus;
  paid_date: string | null;
  paid_from_account_id: string | null;
  paid_from_account_name: string | null;
  recurrence: OverheadRecurrence | null;
  recurrence_days: number | null;
  parent_expense_id: string | null;
  created_at: string;
}

export interface OverheadExpenseCreate {
  title: string;
  category?: OverheadCategory;
  amount: number;
  due_date: string;
  description?: string;
  recurrence?: OverheadRecurrence;
  recurrence_days?: number;
}

export type OverheadExpenseUpdate = Partial<OverheadExpenseCreate>;

export interface MarkPaidRequest {
  account_id: string;
  paid_date?: string;
}

export interface OverheadExpenseListResponse {
  data: OverheadExpense[];
  total: number;
}
```

**Step 2: Append to `frontend/src/hooks/services.ts`** (also add types to import block)

Add to import block: `CashAccount, CashAccountUpdate, CashEntry, CashEntryCreate, CashEntryListResponse, OverheadExpense, OverheadExpenseCreate, OverheadExpenseUpdate, MarkPaidRequest, OverheadExpenseListResponse,`

Append at end of file:
```typescript
// ─── Overhead & Cash ─────────────────────────────────────────────────────────

export const cashAccountService = {
  list: (): Promise<CashAccount[]> =>
    api.get("/overhead/accounts").then((r) => r.data),

  update: (id: string, data: CashAccountUpdate): Promise<CashAccount> =>
    api.patch(`/overhead/accounts/${id}`, data).then((r) => r.data),
};

export const cashEntryService = {
  list: (params: { account_id?: string; page?: number; size?: number } = {}): Promise<CashEntryListResponse> =>
    api.get("/overhead/entries", { params }).then((r) => r.data),

  create: (data: CashEntryCreate): Promise<CashEntry> =>
    api.post("/overhead/entries", data).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/overhead/entries/${id}`).then(() => undefined),
};

export const overheadExpenseService = {
  list: (params: { status?: string; category?: string; page?: number } = {}): Promise<OverheadExpenseListResponse> =>
    api.get("/overhead/expenses", { params }).then((r) => r.data),

  create: (data: OverheadExpenseCreate): Promise<OverheadExpense> =>
    api.post("/overhead/expenses", data).then((r) => r.data),

  update: (id: string, data: OverheadExpenseUpdate): Promise<OverheadExpense> =>
    api.patch(`/overhead/expenses/${id}`, data).then((r) => r.data),

  pay: (id: string, data: MarkPaidRequest): Promise<OverheadExpense> =>
    api.patch(`/overhead/expenses/${id}/pay`, data).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/overhead/expenses/${id}`).then(() => undefined),
};
```

**Step 3: Apply the exact same additions to `frontend/src/hooks/services.tsx`**

**Step 4: Commit**

```bash
git add frontend/src/hooks/types.ts frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: add overhead/cash types and service layer"
```

---

## Task 7: Frontend Overhead Page

**Files:**
- Create: `frontend/src/app/(dashboard)/overhead/page.tsx`

**Step 1: Create the page**

```tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { cashAccountService, cashEntryService, overheadExpenseService } from "@/hooks/services";
import { formatCurrency } from "@/hooks/utils";
import type {
  CashAccount, CashEntry, CashEntryCreate,
  OverheadExpense, OverheadExpenseCreate, MarkPaidRequest,
  OverheadCategory, OverheadRecurrence,
} from "@/hooks/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<OverheadCategory, string> = {
  rent: "bg-blue-100 text-blue-700",
  wages: "bg-green-100 text-green-700",
  utilities: "bg-yellow-100 text-yellow-700",
  insurance: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-600",
};

function isDue(exp: OverheadExpense): boolean {
  return new Date(exp.due_date) <= new Date() && exp.status === "unpaid";
}

// ─── Balance Card ─────────────────────────────────────────────────────────────

function BalanceCard({
  account,
  onAdjust,
}: {
  account: CashAccount;
  onAdjust: (account: CashAccount) => void;
}) {
  const isCash = account.account_type === "cash";
  return (
    <div
      className={`rounded-2xl p-5 flex items-center justify-between ${
        isCash ? "bg-emerald-50 border border-emerald-200" : "bg-blue-50 border border-blue-200"
      }`}
    >
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{account.name}</p>
        <p className={`text-3xl font-extrabold mt-1 ${isCash ? "text-emerald-700" : "text-blue-700"}`}>
          {formatCurrency(account.current_balance)}
        </p>
        {account.note && <p className="text-xs text-gray-400 mt-1">{account.note}</p>}
      </div>
      <button
        onClick={() => onAdjust(account)}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
      >
        + Entry
      </button>
    </div>
  );
}

// ─── Manual Entry Sheet ───────────────────────────────────────────────────────

function EntrySheet({
  account,
  onClose,
  onSaved,
}: {
  account: CashAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CashEntryCreate>({
    account_id: account.id,
    entry_type: "credit",
    amount: 0,
    description: "",
    entry_date: new Date().toISOString().slice(0, 10),
    source: "manual",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await cashEntryService.create(form);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-sm bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add Entry — {account.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={submit} className="flex-1 px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["credit", "debit"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, entry_type: t }))}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    form.entry_type === t
                      ? t === "credit"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-red-600 text-white border-red-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {t === "credit" ? "↑ Credit" : "↓ Debit"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (PKR)</label>
            <input
              required
              type="number"
              min={1}
              value={form.amount || ""}
              onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              required
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Received payment from party"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add Entry"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Expense Sheet ────────────────────────────────────────────────────────────

function ExpenseSheet({
  expense,
  onClose,
  onSaved,
}: {
  expense: OverheadExpense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<OverheadExpenseCreate>({
    title: expense?.title ?? "",
    category: (expense?.category ?? "other") as OverheadCategory,
    amount: expense?.amount ?? 0,
    due_date: expense?.due_date ?? new Date().toISOString().slice(0, 10),
    description: expense?.description ?? "",
    recurrence: (expense?.recurrence ?? "") as OverheadRecurrence,
    recurrence_days: expense?.recurrence_days ?? undefined,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.description) delete payload.description;
      if (!payload.recurrence) delete payload.recurrence;
      if (!payload.recurrence_days) delete payload.recurrence_days;
      if (expense) {
        await overheadExpenseService.update(expense.id, payload);
      } else {
        await overheadExpenseService.create(payload);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{expense ? "Edit Expense" : "New Overhead Expense"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Factory Rent March"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as OverheadCategory }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="rent">Rent</option>
                <option value="wages">Wages</option>
                <option value="utilities">Utilities</option>
                <option value="insurance">Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Amount (PKR)</label>
              <input
                required
                type="number"
                min={1}
                value={form.amount || ""}
                onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recurrence</label>
            <select
              value={form.recurrence ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value as OverheadRecurrence || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">One-off</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </div>
          {form.recurrence === "custom" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Every N days</label>
              <input
                type="number"
                min={1}
                value={form.recurrence_days ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, recurrence_days: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : expense ? "Save Changes" : "Add Expense"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Pay Modal ────────────────────────────────────────────────────────────────

function PayModal({
  expense,
  accounts,
  onClose,
  onPaid,
}: {
  expense: OverheadExpense;
  accounts: CashAccount[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await overheadExpenseService.pay(expense.id, { account_id: accountId });
      onPaid();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Mark as Paid</h3>
        <p className="text-sm text-gray-500 mb-4">{expense.title} — {formatCurrency(expense.amount)}</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pay from</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatCurrency(a.current_balance)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {saving ? "Paying..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OverheadPage() {
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [expenses, setExpenses] = useState<OverheadExpense[]>([]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [runningBalance, setRunningBalance] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"expenses" | "ledger">("expenses");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [entrySheet, setEntrySheet] = useState<CashAccount | null>(null);
  const [expenseSheet, setExpenseSheet] = useState<OverheadExpense | null | "new">(null);
  const [payModal, setPayModal] = useState<OverheadExpense | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const loadAccounts = useCallback(async () => {
    const data = await cashAccountService.list();
    setAccounts(data);
    if (!selectedAccount && data.length > 0) setSelectedAccount(data[0].id);
  }, [selectedAccount]);

  const loadExpenses = useCallback(async () => {
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    const data = await overheadExpenseService.list(params);
    setExpenses(data.data);
  }, [statusFilter, categoryFilter]);

  const loadEntries = useCallback(async () => {
    if (!selectedAccount) return;
    const data = await cashEntryService.list({ account_id: selectedAccount, size: 100 });
    setEntries(data.data);
    setTotalEntries(data.total);
    setRunningBalance((p) => ({ ...p, [selectedAccount]: data.running_balance }));
  }, [selectedAccount]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadAccounts(), loadExpenses(), loadEntries()]);
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadExpenses, loadEntries]);

  useEffect(() => { reload(); }, [reload]);

  const unpaidCount = expenses.filter((e) => e.status === "unpaid").length;
  const overdueCount = expenses.filter(isDue).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overhead & Cash</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unpaidCount} unpaid
            {overdueCount > 0 && <span className="ml-2 text-red-600 font-medium">{overdueCount} overdue</span>}
          </p>
        </div>
        <button
          onClick={() => setExpenseSheet("new")}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + Add Expense
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {accounts.map((a) => (
          <BalanceCard key={a.id} account={a} onAdjust={setEntrySheet} />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["expenses", "ledger"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "expenses" ? "Overhead Expenses" : "Cash Ledger"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : tab === "expenses" ? (
        <div className="space-y-4">
          {/* Expense filters */}
          <div className="flex flex-wrap gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="rent">Rent</option>
              <option value="wages">Wages</option>
              <option value="utilities">Utilities</option>
              <option value="insurance">Insurance</option>
              <option value="other">Other</option>
            </select>
            {(statusFilter || categoryFilter) && (
              <button onClick={() => { setStatusFilter(""); setCategoryFilter(""); }} className="text-xs text-blue-600 hover:underline ml-auto">
                Clear
              </button>
            )}
          </div>

          {/* Expense list */}
          {expenses.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No expenses found</div>
          ) : (
            <div className="flex flex-col gap-3">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className={`bg-white border rounded-xl p-4 flex items-center gap-4 ${
                    isDue(exp) ? "border-red-200 bg-red-50" : "border-gray-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{exp.title}</p>
                      {exp.recurrence && <span className="text-blue-400 text-sm">↻</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[exp.category]}`}>
                        {exp.category}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        exp.status === "paid" ? "bg-green-100 text-green-700" : isDue(exp) ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {exp.status === "paid" ? "paid" : isDue(exp) ? "overdue" : "unpaid"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Due: {new Date(exp.due_date).toLocaleDateString()}
                      {exp.paid_from_account_name && ` · Paid via ${exp.paid_from_account_name}`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-800 flex-shrink-0">{formatCurrency(exp.amount)}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {exp.status === "unpaid" && (
                      <button
                        onClick={() => setPayModal(exp)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                      >
                        Pay →
                      </button>
                    )}
                    <button
                      onClick={() => setExpenseSheet(exp)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={async () => { if (confirm("Delete this expense?")) { await overheadExpenseService.delete(exp.id); reload(); } }}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account selector */}
          <div className="flex gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAccount(a.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedAccount === a.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          {/* Entries list */}
          {entries.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No entries yet</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Credit</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Debit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{new Date(e.entry_date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-gray-800">{e.description}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                        {e.entry_type === "credit" ? formatCurrency(e.amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-red-500 font-medium">
                        {e.entry_type === "debit" ? formatCurrency(e.amount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Running Balance</td>
                    <td colSpan={2} className="px-4 py-3 text-right text-base font-bold text-blue-700">
                      {formatCurrency(runningBalance[selectedAccount] ?? 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {entrySheet && <EntrySheet account={entrySheet} onClose={() => setEntrySheet(null)} onSaved={reload} />}
      {expenseSheet !== null && (
        <ExpenseSheet
          expense={expenseSheet === "new" ? null : expenseSheet}
          onClose={() => setExpenseSheet(null)}
          onSaved={reload}
        />
      )}
      {payModal && (
        <PayModal expense={payModal} accounts={accounts} onClose={() => setPayModal(null)} onPaid={reload} />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "frontend/src/app/(dashboard)/overhead/page.tsx"
git commit -m "feat: add overhead/cash management page"
```

---

## Task 8: Nav Item + Dashboard Cash Widget

**Files:**
- Modify: `frontend/src/app/(dashboard)/layout.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`

### Part A — Nav Item

**Step 1: Add `IconBuilding` icon function to layout.tsx** (after `IconCheckSquare`):

```tsx
function IconBuilding() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
```

**Step 2: Add to `NAV_ITEMS`** after the Todos entry:

```tsx
{ label: "Overhead", href: "/overhead", icon: <IconBuilding /> },
```

### Part B — Dashboard Cash Widget

**Step 1: Read `frontend/src/app/(dashboard)/dashboard/page.tsx`** to find where to add the widget.

**Step 2: Add import** at the top of dashboard/page.tsx:

```tsx
import { cashAccountService } from "@/hooks/services";
import type { CashAccount } from "@/hooks/types";
```

**Step 3: Add state + effect** inside `DashboardPage` component, after existing state declarations:

```tsx
const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);

useEffect(() => {
  cashAccountService.list().then(setCashAccounts).catch(() => {});
}, []);
```

**Step 4: Add Cash Position card** in the JSX, after the existing stat cards grid (find a good placement — after the first grid of StatCards):

```tsx
{/* Cash Position */}
{cashAccounts.length > 0 && (
  <div className="bg-white border border-gray-200 rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-gray-700 mb-4">Cash Position</h3>
    <div className="grid grid-cols-2 gap-4">
      {cashAccounts.map((a) => (
        <div key={a.id} className={`rounded-xl p-4 ${a.account_type === "cash" ? "bg-emerald-50" : "bg-blue-50"}`}>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{a.name}</p>
          <p className={`text-2xl font-extrabold mt-1 ${a.account_type === "cash" ? "text-emerald-700" : "text-blue-700"}`}>
            {formatCurrency(a.current_balance)}
          </p>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 5: Commit**

```bash
git add "frontend/src/app/(dashboard)/layout.tsx" "frontend/src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: add overhead nav item and dashboard cash widget"
```

---

## Task 9: Deploy

**Step 1: Push**

```bash
git push origin master
```

**Step 2: Run seed script on production**

The two default cash accounts need to be seeded on the production database. Since Render doesn't provide shell access on free tier, add a one-time seed endpoint OR run the seed via the Render console.

Easiest: add a temporary seed call to `backend/app/main.py` startup event:

Read `backend/app/main.py` and add after existing startup logic:

```python
@app.on_event("startup")
async def seed_cash_accounts():
    from app.models.overhead import CashAccount
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        count = db.query(CashAccount).filter(CashAccount.is_deleted == False).count()
        if count == 0:
            db.add(CashAccount(name="Cash In Hand", account_type="cash", opening_balance=0))
            db.add(CashAccount(name="Bank", account_type="bank", opening_balance=0))
            db.commit()
    finally:
        db.close()
```

**Step 3: Redeploy frontend**

```bash
cd frontend && vercel deploy --prod
```

**Step 4: Smoke test**

1. Open https://cmt-stitching-asadullah-shafiques-projects.vercel.app
2. Sidebar shows "Overhead" link
3. `/overhead` page loads with Cash In Hand + Bank cards (both PKR 0)
4. Click `+ Entry` on Cash In Hand → add PKR 50,000 credit → balance updates
5. Click `+ Add Expense` → add "Factory Rent" → appears in list as unpaid
6. Click `Pay →` → choose Cash In Hand → balance decreases by rent amount
7. Switch to Cash Ledger tab → debit entry visible
8. Dashboard → Cash Position widget shows both balances

---

## Summary

| Task | Files | Status |
|------|-------|--------|
| 1. Models | `backend/app/models/overhead.py` | - |
| 2. Migration + seed | `alembic/versions/o5j6k7l8m9n0_...` | - |
| 3. Schemas | `backend/app/schemas/overhead.py` | - |
| 4. Endpoint | `backend/app/api/v1/endpoints/overhead.py` | - |
| 5. Router | `backend/app/api/v1/router.py` | - |
| 6. Types + Services | `hooks/types.ts`, `services.ts`, `services.tsx` | - |
| 7. Overhead Page | `(dashboard)/overhead/page.tsx` | - |
| 8. Nav + Dashboard | `layout.tsx`, `dashboard/page.tsx` | - |
| 9. Deploy | push + vercel deploy --prod | - |
