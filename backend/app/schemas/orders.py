from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, model_validator


class OrderStatus(str, Enum):
    pending = "pending"
    stitching_in_progress = "stitching_in_progress"
    stitching_complete = "stitching_complete"
    packing_in_progress = "packing_in_progress"
    packing_complete = "packing_complete"
    dispatched = "dispatched"


class OrderItemCreate(BaseModel):
    size: str
    quantity: int


class OrderItemOut(BaseModel):
    id: UUID
    size: str
    quantity: int
    completed_quantity: int
    packed_quantity: int

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    party_id: Optional[UUID] = None
    party_reference: Optional[str] = None
    goods_description: str
    total_quantity: int
    stitch_rate_party: Decimal
    stitch_rate_labor: Decimal
    pack_rate_party: Optional[Decimal] = None
    pack_rate_labor: Optional[Decimal] = None
    entry_date: date
    arrival_date: Optional[date] = None
    delivery_date: Optional[date] = None
    estimated_completion: Optional[date] = None
    items: list[OrderItemCreate]

    @model_validator(mode="after")
    def check_pack_rates_together(self):
        has_party = self.pack_rate_party is not None
        has_labor = self.pack_rate_labor is not None
        if has_party != has_labor:
            raise ValueError("pack_rate_party and pack_rate_labor must both be set or both omitted")
        return self


class OrderUpdate(BaseModel):
    party_id: Optional[UUID] = None
    party_reference: Optional[str] = None
    goods_description: Optional[str] = None
    total_quantity: Optional[int] = None
    stitch_rate_party: Optional[Decimal] = None
    stitch_rate_labor: Optional[Decimal] = None
    pack_rate_party: Optional[Decimal] = None
    pack_rate_labor: Optional[Decimal] = None
    entry_date: Optional[date] = None
    arrival_date: Optional[date] = None
    delivery_date: Optional[date] = None
    estimated_completion: Optional[date] = None
    actual_completion: Optional[date] = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderOut(BaseModel):
    id: UUID
    order_number: str
    party_id: Optional[UUID] = None
    party_name: Optional[str] = None
    party_reference: Optional[str] = None
    goods_description: str
    total_quantity: int
    stitch_rate_party: Decimal
    stitch_rate_labor: Decimal
    pack_rate_party: Optional[Decimal] = None
    pack_rate_labor: Optional[Decimal] = None
    status: str
    entry_date: date
    arrival_date: Optional[date] = None
    delivery_date: Optional[date] = None
    estimated_completion: Optional[date] = None
    actual_completion: Optional[date] = None
    items: list[OrderItemOut] = []

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    data: list[OrderOut]
    total: int
    page: int
    size: int
