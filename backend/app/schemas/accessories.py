from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, computed_field


class AccessoryCreate(BaseModel):
    name: str
    total_qty: Decimal
    unit_price: Decimal
    from_stock: Decimal = Decimal("0")
    purchased_qty: Decimal = Decimal("0")
    purchase_cost: Optional[Decimal] = None
    inventory_item_id: Optional[UUID] = None


class AccessoryUpdate(BaseModel):
    name: Optional[str] = None
    total_qty: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    from_stock: Optional[Decimal] = None
    purchased_qty: Optional[Decimal] = None
    purchase_cost: Optional[Decimal] = None
    inventory_item_id: Optional[UUID] = None


class AccessoryOut(BaseModel):
    id: UUID
    order_id: UUID
    name: str
    total_qty: Decimal
    unit_price: Decimal
    from_stock: Decimal
    purchased_qty: Decimal
    purchase_cost: Optional[Decimal] = None
    inventory_item_id: Optional[UUID] = None
    inventory_item_name: Optional[str] = None

    @computed_field
    @property
    def total_charge(self) -> Decimal:
        return self.total_qty * self.unit_price

    @computed_field
    @property
    def total_purchase_spend(self) -> Optional[Decimal]:
        if self.purchase_cost is None:
            return None
        return self.purchased_qty * self.purchase_cost

    model_config = {"from_attributes": True}
