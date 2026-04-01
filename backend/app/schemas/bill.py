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
    order_id: Optional[UUID] = None
    party_id: Optional[UUID] = None       # required when order_id is None
    description: Optional[str] = None    # ledger description for standalone bills
    bill_number: Optional[str] = None   # None = auto-generate
    bill_series: str = "A"              # series to use for auto-gen
    bill_date: date
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    amount_due: Decimal
    discount: Optional[Decimal] = Decimal("0")
    notes: Optional[str] = None

    @model_validator(mode="after")
    def bill_number_or_series(self):
        if self.bill_number is not None:
            self.bill_number = self.bill_number.strip().upper()
            if not self.bill_number:
                raise ValueError("bill_number cannot be blank")
        return self

    @model_validator(mode="after")
    def standalone_requires_party(self):
        if self.order_id is None and self.party_id is None:
            raise ValueError("party_id is required when order_id is not provided")
        return self


class BillUpdate(BaseModel):
    bill_date: Optional[date] = None
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    discount: Optional[Decimal] = None
    amount_due: Optional[Decimal] = None
    amount_paid: Optional[Decimal] = None
    notes: Optional[str] = None
    goods_description: Optional[str] = None   # updates the linked order's goods_description


class BillPaymentUpdate(BaseModel):
    amount: Decimal
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class BillOut(BaseModel):
    id: UUID
    bill_number: str
    bill_series: str
    bill_sequence: int
    order_id: Optional[UUID] = None
    order_number: Optional[str] = None
    party_id: Optional[UUID] = None
    party_name: Optional[str] = None
    party_contact_person: Optional[str] = None
    party_phone: Optional[str] = None
    party_address: Optional[str] = None
    bill_date: date
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    payment_status: str
    amount_due: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    discount: Decimal = Decimal("0")
    previous_balance: Decimal = Decimal("0")
    subtotal: Decimal = Decimal("0")
    order_items: list[dict] = []
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
