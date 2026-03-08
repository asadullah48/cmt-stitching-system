from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ─── Category ─────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    category_type: str  # raw_material | finished_goods | accessories


class CategoryOut(BaseModel):
    id: UUID
    name: str
    category_type: str

    model_config = {"from_attributes": True}


# ─── Item ─────────────────────────────────────────────────────────────────────

class InventoryItemCreate(BaseModel):
    category_id: Optional[UUID] = None
    name: str
    sku: Optional[str] = None
    unit: str
    current_stock: Optional[Decimal] = Decimal("0")
    minimum_stock: Optional[Decimal] = Decimal("0")
    cost_per_unit: Optional[Decimal] = None
    location: Optional[str] = None
    condition: Optional[str] = "good"


class InventoryItemUpdate(BaseModel):
    category_id: Optional[UUID] = None
    name: Optional[str] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    minimum_stock: Optional[Decimal] = None
    cost_per_unit: Optional[Decimal] = None
    location: Optional[str] = None
    condition: Optional[str] = None


class InventoryItemOut(BaseModel):
    id: UUID
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    category_type: Optional[str] = None
    name: str
    sku: Optional[str] = None
    unit: str
    current_stock: Decimal
    minimum_stock: Decimal
    cost_per_unit: Optional[Decimal] = None
    location: Optional[str] = None
    condition: Optional[str] = None

    model_config = {"from_attributes": True}


class InventoryItemListResponse(BaseModel):
    data: list[InventoryItemOut]
    total: int
    page: int
    size: int


# ─── Stock Adjustment ─────────────────────────────────────────────────────────

class StockAdjustment(BaseModel):
    quantity: Decimal        # positive = stock in, negative = stock out
    notes: Optional[str] = None
