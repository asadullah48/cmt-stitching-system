from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    party_id: Optional[UUID] = None
    order_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    transaction_type: str          # income | payment | adjustment
    amount: Decimal
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    transaction_date: date


class TransactionOut(BaseModel):
    id: UUID
    party_id: Optional[UUID] = None
    party_name: Optional[str] = None
    order_id: Optional[UUID] = None
    order_number: Optional[str] = None
    bill_id: Optional[UUID] = None
    transaction_type: str
    amount: Decimal
    payment_method: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    transaction_date: date
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    data: list[TransactionOut]
    total: int
    page: int
    size: int


class PartyLedgerResponse(BaseModel):
    party_id: UUID
    party_name: str
    balance: Decimal
    transactions: list[TransactionOut]
