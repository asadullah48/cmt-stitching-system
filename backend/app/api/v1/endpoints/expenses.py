from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbDep
from app.models.expenses import Expense, ExpenseCategory
from app.schemas.expenses import ExpenseCreate, ExpenseOut, ExpenseListResponse, ExpenseCategoryOut

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _to_out(expense) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        category_id=expense.category_id,
        category_name=expense.category.name if expense.category else None,
        order_id=expense.order_id,
        order_number=expense.order.order_number if expense.order else None,
        amount=expense.amount,
        description=expense.description,
        expense_date=expense.expense_date,
        receipt_number=expense.receipt_number,
    )


@router.get("/categories", response_model=list[ExpenseCategoryOut])
def list_categories(db: DbDep, _: CurrentUser):
    """List all active expense categories."""
    cats = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.is_deleted.is_(False), ExpenseCategory.is_active.is_(True))
        .order_by(ExpenseCategory.name)
        .all()
    )
    return [ExpenseCategoryOut(id=c.id, name=c.name, category_type=c.category_type) for c in cats]


@router.get("/", response_model=ExpenseListResponse)
def list_expenses(
    db: DbDep,
    _: CurrentUser,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    order_id: Optional[UUID] = Query(None),
    category_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """List expenses with optional filtering by order, category, and date range."""
    q = (
        db.query(Expense)
        .options(joinedload(Expense.category), joinedload(Expense.order))
        .filter(Expense.is_deleted.is_(False))
    )

    if order_id:
        q = q.filter(Expense.order_id == order_id)
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    if date_from:
        q = q.filter(Expense.expense_date >= date_from)
    if date_to:
        q = q.filter(Expense.expense_date <= date_to)

    total = q.count()
    expenses = (
        q.order_by(Expense.expense_date.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return ExpenseListResponse(data=[_to_out(e) for e in expenses], total=total, page=page, size=size)


@router.post("/", response_model=ExpenseOut, status_code=201)
def create_expense(data: ExpenseCreate, db: DbDep, current_user: CurrentUser):
    """Record a new expense."""
    expense = Expense(
        category_id=data.category_id,
        order_id=data.order_id,
        amount=data.amount,
        description=data.description,
        expense_date=data.expense_date,
        receipt_number=data.receipt_number,
        created_by=current_user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    # Reload with relationships for the response
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category), joinedload(Expense.order))
        .filter(Expense.id == expense.id)
        .first()
    )
    return _to_out(expense)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: UUID, db: DbDep, _: CurrentUser):
    """Retrieve a single expense by ID."""
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category), joinedload(Expense.order))
        .filter(Expense.id == expense_id, Expense.is_deleted.is_(False))
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _to_out(expense)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: UUID, db: DbDep, _: CurrentUser):
    """Soft-delete an expense."""
    expense = (
        db.query(Expense)
        .filter(Expense.id == expense_id, Expense.is_deleted.is_(False))
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense.is_deleted = True
    db.commit()
