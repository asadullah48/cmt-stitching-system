from datetime import date, datetime, timedelta
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
    running = Decimal("0")
    if account_id:
        acct = db.query(CashAccount).filter(CashAccount.id == account_id).first()
        if acct:
            running = _compute_balance(db, acct)
    return CashEntryListResponse(data=[_entry_out(e) for e in entries], total=total, running_balance=running)


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
    exp = db.query(OverheadExpense).filter(OverheadExpense.id == expense_id, OverheadExpense.is_deleted == False).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.status == "paid":
        raise HTTPException(status_code=400, detail="Already paid")
    acct = db.query(CashAccount).filter(CashAccount.id == payload.account_id, CashAccount.is_deleted == False).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Cash account not found")
    paid_on = payload.paid_date or date.today()
    exp.status = "paid"
    exp.paid_date = paid_on
    exp.paid_from_account_id = payload.account_id
    db.add(CashEntry(
        account_id=payload.account_id,
        entry_type="debit",
        amount=exp.amount,
        description=f"Paid: {exp.title}",
        entry_date=paid_on,
        source="overhead",
        source_id=exp.id,
        created_by=current_user.id,
    ))
    _spawn_next_expense(db, exp)
    db.commit()
    db.refresh(exp)
    return _expense_out(exp)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: UUID, db: DbDep, _: CurrentUser):
    exp = db.query(OverheadExpense).filter(OverheadExpense.id == expense_id, OverheadExpense.is_deleted == False).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    exp.is_deleted = True
    exp.deleted_at = datetime.utcnow()
    db.commit()
