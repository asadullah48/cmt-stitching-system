from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ExpenseCategoryOut(BaseModel):
    id: UUID
    name: str
    category_type: str  # variable | overhead | labor

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    category_id: Optional[UUID] = None
    order_id: Optional[UUID] = None
    amount: Decimal
    description: Optional[str] = None
    expense_date: date
    receipt_number: Optional[str] = None


class ExpenseOut(BaseModel):
    id: UUID
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    order_id: Optional[UUID] = None
    order_number: Optional[str] = None
    amount: Decimal
    description: Optional[str] = None
    expense_date: date
    receipt_number: Optional[str] = None

    model_config = {"from_attributes": True}


class ExpenseListResponse(BaseModel):
    data: list[ExpenseOut]
    total: int
    page: int
    size: int
