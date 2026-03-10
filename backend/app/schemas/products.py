from __future__ import annotations
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
import uuid


class BOMItemCreate(BaseModel):
    inventory_item_id: uuid.UUID
    material_quantity: Decimal
    covers_quantity: Decimal = Decimal("1")
    department: str  # "stitching" | "packing"
    notes: Optional[str] = None


class BOMItemOut(BaseModel):
    id: uuid.UUID
    inventory_item_id: uuid.UUID
    inventory_item_name: str
    inventory_item_unit: str
    material_quantity: Decimal
    covers_quantity: Decimal
    department: str
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None


class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    bom_items: List[BOMItemOut] = []

    model_config = {"from_attributes": True}


class MaterialRequirement(BaseModel):
    inventory_item_id: uuid.UUID
    inventory_item_name: str
    unit: str
    material_quantity: Decimal
    covers_quantity: Decimal
    required: Decimal
    in_stock: Decimal
    shortfall: Decimal
    sufficient: bool
    department: str
    notes: Optional[str] = None


class OrderMaterialsOut(BaseModel):
    product_name: Optional[str] = None
    order_quantity: int
    stitching: List[MaterialRequirement] = []
    packing: List[MaterialRequirement] = []
    stitching_consumed: bool = False
    packing_consumed: bool = False
