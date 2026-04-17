from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class BillAllocationItem(BaseModel):
    bill_id: UUID
    bill_number: str
    bill_series: str
    bill_date: date
    amount_due: Decimal
    explicit_paid: Decimal
    advance_applied: Decimal
    effective_paid: Decimal
    outstanding: Decimal
    effective_status: str   # paid | partial | unpaid

    model_config = {"from_attributes": True}


class BillAllocationResponse(BaseModel):
    party_id: UUID
    party_name: str
    total_billed: Decimal
    total_paid: Decimal
    total_outstanding: Decimal
    advance_balance: Decimal
    bills: list[BillAllocationItem]
