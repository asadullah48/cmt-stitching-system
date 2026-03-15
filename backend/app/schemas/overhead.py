from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


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


class CashAccountUpdate(BaseModel):
    opening_balance: Optional[Decimal] = None
    note: Optional[str] = None


class CashAccountOut(BaseModel):
    id: UUID
    name: str
    account_type: str
    opening_balance: Decimal
    current_balance: Decimal
    note: Optional[str]
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    running_balance: Decimal


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
    account_id: UUID
    paid_date: Optional[date] = None


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
