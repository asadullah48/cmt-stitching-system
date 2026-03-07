from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel


CHECKPOINT_NAMES = [
    "Pre-Stitch Inspection",
    "Seam Strength Test",
    "Final AQL Audit",
]

DEFECT_TYPES = [
    "Thread Knotting",
    "Misaligned Seam",
    "Puckering",
    "Broken Stitch",
    "Loose Thread",
    "Fabric Damage",
    "Other",
]


class QualityCheckpoint(BaseModel):
    __tablename__ = "cmt_quality_checkpoints"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    checkpoint_name = Column(String(100), nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    checked_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    order = relationship("Order", back_populates="quality_checkpoints")


class DefectLog(BaseModel):
    __tablename__ = "cmt_defect_logs"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    defect_type = Column(String(100), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    notes = Column(Text, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order", back_populates="defect_logs")
