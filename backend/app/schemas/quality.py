from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class CheckpointUpdate(BaseModel):
    passed: bool
    notes: Optional[str] = None


class CheckpointOut(BaseModel):
    id: UUID
    order_id: UUID
    checkpoint_name: str
    passed: bool
    checked_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class DefectLogCreate(BaseModel):
    order_id: UUID
    defect_type: str
    quantity: int = 1
    notes: Optional[str] = None


class DefectLogOut(BaseModel):
    id: UUID
    order_id: UUID
    defect_type: str
    quantity: int
    notes: Optional[str] = None
    logged_at: datetime

    model_config = {"from_attributes": True}


class QualityReport(BaseModel):
    order_id: UUID
    order_number: str
    checkpoints: List[CheckpointOut]
    defects: List[DefectLogOut]
    all_passed: bool
