from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel


class BillRateTemplateOut(BaseModel):
    id: UUID
    goods_type: str
    bill_series: str
    description: str | None
    customer_rate: Decimal
    labour_rate: Decimal
    vendor_rate: Decimal
    is_active: bool

    model_config = {"from_attributes": True}


class BillRateTemplateUpdate(BaseModel):
    description: str | None = None
    customer_rate: Decimal | None = None
    labour_rate: Decimal | None = None
    vendor_rate: Decimal | None = None
    is_active: bool | None = None
