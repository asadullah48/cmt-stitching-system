from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, model_validator


class OrderStatus(str, Enum):
    pending = "pending"
    cutting_in_progress = "cutting_in_progress"
    cutting_complete = "cutting_complete"
    stitching_in_progress = "stitching_in_progress"
    stitching_complete = "stitching_complete"
    packing_in_progress = "packing_in_progress"
    packing_complete = "packing_complete"
    dispatched = "dispatched"


class OrderItemCreate(BaseModel):
    size: str
    quantity: int


class OrderItemUpdate(BaseModel):
    id: Optional[UUID] = None  # existing item ID; None = new item
    size: str
    quantity: int
    cut_quantity: Optional[int] = None
    completed_quantity: Optional[int] = None
    packed_quantity: Optional[int] = None


class OrderItemOut(BaseModel):
    id: UUID
    size: str
    quantity: int
    cut_quantity: int
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
    transport_expense: Optional[Decimal] = Decimal("0")
    loading_expense: Optional[Decimal] = Decimal("0")
    miscellaneous_expense: Optional[Decimal] = Decimal("0")
    rent: Optional[Decimal] = Decimal("0")
    loading_charges: Optional[Decimal] = Decimal("0")
    product_id: Optional[UUID] = None
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None           # "A" or "B"
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None     # subset of ["packing","loading","ready_to_invoice","invoiced"]
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
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    transport_expense: Optional[Decimal] = None
    loading_expense: Optional[Decimal] = None
    miscellaneous_expense: Optional[Decimal] = None
    rent: Optional[Decimal] = None
    loading_charges: Optional[Decimal] = None
    product_id: Optional[UUID] = None
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None
    current_stage: Optional[str] = None


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
    carrier: Optional[str] = None
    tracking_number: Optional[str] = None
    dispatch_date: Optional[date] = None
    carton_count: Optional[int] = None
    total_weight: Optional[Decimal] = None
    transport_expense: Optional[Decimal] = Decimal("0")
    loading_expense: Optional[Decimal] = Decimal("0")
    miscellaneous_expense: Optional[Decimal] = Decimal("0")
    rent: Optional[Decimal] = Decimal("0")
    loading_charges: Optional[Decimal] = Decimal("0")
    product_id: Optional[UUID] = None
    product_name: Optional[str] = None
    lot_number: Optional[int] = None
    sub_suffix: Optional[str] = None
    parent_order_id: Optional[UUID] = None
    sub_stages: Optional[list[str]] = None
    current_stage: Optional[str] = None
    items: list[OrderItemOut] = []
    cut_quantity_total: int = 0
    over_cut_warning: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def calculate_cut_warning(self):
        self.cut_quantity_total = sum(item.cut_quantity for item in self.items)
        self.over_cut_warning = self.cut_quantity_total > self.total_quantity
        return self


class OrderListResponse(BaseModel):
    data: list[OrderOut]
    total: int
    page: int
    size: int


SUB_ORDER_STAGES = ["packing", "loading", "ready_to_invoice", "invoiced"]

class SubOrderStageAdvance(BaseModel):
    """Advance a B sub-order to the next stage, or set a specific stage."""
    stage: str  # must be one of SUB_ORDER_STAGES
