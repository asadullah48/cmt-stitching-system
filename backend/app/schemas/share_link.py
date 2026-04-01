from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, model_validator


class ShareLinkCreate(BaseModel):
    party_id: UUID
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def date_range_valid(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self


class ShareLinkOut(BaseModel):
    id: UUID
    token: UUID
    party_id: UUID
    party_name: Optional[str] = None
    date_from: date
    date_to: date
    created_at: datetime
    is_revoked: bool

    model_config = {"from_attributes": True}


class ShareLinkListResponse(BaseModel):
    data: list[ShareLinkOut]
    total: int


class PublicTransactionRow(BaseModel):
    transaction_date: date
    transaction_type: str
    description: Optional[str] = None
    reference_number: Optional[str] = None
    payment_method: Optional[str] = None
    debit: Optional[float] = None
    credit: Optional[float] = None
    running_balance: float


class PublicStatementOut(BaseModel):
    party_name: str
    date_from: date
    date_to: date
    transactions: list[PublicTransactionRow]
    total_debit: float
    total_credit: float
    outstanding_balance: float
