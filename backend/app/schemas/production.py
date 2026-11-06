from datetime import date, time
from decimal import Decimal
from enum import Enum
from typing import Annotated, Optional
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator


class Department(str, Enum):
    cutting = "cutting"
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

    operator_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    pieces: int | None = Field(default=None, ge=0, le=2147483647)
    piece_rate: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    wastage: int | None = Field(default=None, ge=0, le=2147483647)

    @model_validator(mode="after")
    def validate_piecework(self):
        fields = (self.operator_name, self.pieces, self.piece_rate, self.wastage)
        if all(value is None for value in fields):
            return self
        if any(value is None for value in fields):
            raise ValueError("Operator, pieces, rate and wastage are all required for piecework")
        if self.department == Department.cutting:
            raise ValueError("Piecework is supported for stitching and packing")
        if self.pieces == 0 and self.wastage == 0:
            raise ValueError("Enter at least one good or wasted piece")
        return self


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

    operator_name: str | None = None
    pieces: int | None = None
    piece_rate: Decimal | None = None
    wastage: int | None = None

    model_config = {"from_attributes": True}


class ProductionListResponse(BaseModel):
    data: list[ProductionSessionOut]
    total: int
    page: int
    size: int
