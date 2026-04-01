from sqlalchemy import Column, String, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import BaseModel


class OrderAccessory(BaseModel):
    __tablename__ = "cmt_order_accessories"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=False)
    name = Column(String(100), nullable=False)
    total_qty = Column(Numeric(10, 2), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    from_stock = Column(Numeric(10, 2), nullable=False, default=0)
    purchased_qty = Column(Numeric(10, 2), nullable=False, default=0)
    purchase_cost = Column(Numeric(10, 2), nullable=True)

    order = relationship("Order", back_populates="accessories")
