from datetime import date, time
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class Department(str, Enum):
    stitching = "stitching"
    packing = "packing"


class ProductionSessionCreate(BaseModel):
    order_id: UUID
    department: Department
    session_date: date
    machines_used: int
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_hours: Optional[Decimal] = None
    notes: Optional[str] = None


class ProductionSessionOut(BaseModel):
    id: UUID
    order_id: UUID
    order_number: Optional[str] = None
    department: str
    session_date: date
    machines_used: int
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_hours: Optional[Decimal] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class ProductionListResponse(BaseModel):
    data: list[ProductionSessionOut]
    total: int
    page: int
    size: int
