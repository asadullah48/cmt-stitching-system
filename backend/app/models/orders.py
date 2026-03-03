from sqlalchemy import Column, String, Integer, Numeric, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel

class Order(BaseModel):
    __tablename__ = "cmt_orders"

    order_number = Column(String(50), unique=True, nullable=False)
    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=True)
    party_reference = Column(String(100))
    goods_description = Column(Text, nullable=False)
    total_quantity = Column(Integer, nullable=False)
    stitch_rate_party = Column(Numeric(10, 2), nullable=False)
    stitch_rate_labor = Column(Numeric(10, 2), nullable=False)
    pack_rate_party = Column(Numeric(10, 2), nullable=True)
    pack_rate_labor = Column(Numeric(10, 2), nullable=True)
    # Status lifecycle:
    # pending | stitching_in_progress | stitching_complete
    # packing_in_progress | packing_complete | dispatched
    status = Column(String(30), default="pending", nullable=False)
    entry_date = Column(Date, nullable=False)
    arrival_date = Column(Date)
    delivery_date = Column(Date)
    estimated_completion = Column(Date)
    actual_completion = Column(Date)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    party = relationship("Party", back_populates="orders")
    creator = relationship("User", back_populates="created_orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    production_sessions = relationship("ProductionSession", back_populates="order")
    expenses = relationship("Expense", back_populates="order")
    transactions = relationship("FinancialTransaction", back_populates="order")


class OrderItem(BaseModel):
    __tablename__ = "cmt_order_items"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id", ondelete="CASCADE"))
    size = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False)
    completed_quantity = Column(Integer, default=0)   # stitching progress
    packed_quantity = Column(Integer, default=0)      # packing progress

    # Relationships
    order = relationship("Order", back_populates="items")