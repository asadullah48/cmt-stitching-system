from sqlalchemy import Column, String, Integer, Date, Time, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class ProductionSession(BaseModel):
    __tablename__ = "cmt_production_sessions"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    department = Column(String(20), nullable=False, default="stitching")  # stitching | packing
    session_date = Column(Date, nullable=False)
    machines_used = Column(Integer, nullable=False)
    start_time = Column(Time)
    end_time = Column(Time)
    duration_hours = Column(Numeric(5, 2))
    supervisor_id = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    notes = Column(Text)

    # Relationships
    order = relationship("Order", back_populates="production_sessions")
    supervisor = relationship("User")