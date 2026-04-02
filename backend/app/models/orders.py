from sqlalchemy import Column, String, Integer, Numeric, Date, Text, ForeignKey, JSON
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
    carrier = Column(String(50), nullable=True)
    tracking_number = Column(String(100), nullable=True)
    dispatch_date = Column(Date, nullable=True)
    carton_count = Column(Integer, nullable=True)
    total_weight = Column(Numeric(8, 2), nullable=True)
    # Per-order expenses for net income calculation
    transport_expense = Column(Numeric(10, 2), nullable=True, default=0)
    loading_expense = Column(Numeric(10, 2), nullable=True, default=0)
    miscellaneous_expense = Column(Numeric(10, 2), nullable=True, default=0)
    rent = Column(Numeric(10, 2), nullable=True, default=0)
    loading_charges = Column(Numeric(10, 2), nullable=True, default=0)
    # Lot number — auto-assigned per party + party_reference on create; editable manually
    lot_number = Column(Integer, nullable=True)
    # Sub-order support: suffix "A" or "B", parent link, and stage tracking for B
    sub_suffix = Column(String(5), nullable=True)
    parent_order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    sub_stages = Column(JSON, nullable=True)   # list of selected stage keys e.g. ["packing","invoiced"]
    current_stage = Column(String(30), nullable=True)
    # Optional link to a product; used to drive BOM-based inventory deductions
    product_id = Column(UUID(as_uuid=True), ForeignKey("cmt_products.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    party = relationship("Party", back_populates="orders")
    creator = relationship("User", back_populates="created_orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    production_sessions = relationship("ProductionSession", back_populates="order")
    expenses = relationship("Expense", back_populates="order")
    transactions = relationship("FinancialTransaction", back_populates="order")
    quality_checkpoints = relationship("QualityCheckpoint", back_populates="order", cascade="all, delete-orphan")
    defect_logs = relationship("DefectLog", back_populates="order", cascade="all, delete-orphan")
    product = relationship("Product", back_populates="orders")
    bills = relationship("Bill", back_populates="order")
    accessories = relationship("OrderAccessory", back_populates="order", cascade="all, delete-orphan")
    sub_orders = relationship("Order", foreign_keys="[Order.parent_order_id]", backref="parent_order")


class OrderItem(BaseModel):
    __tablename__ = "cmt_order_items"

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id", ondelete="CASCADE"))
    size = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False)
    completed_quantity = Column(Integer, default=0)   # stitching progress
    packed_quantity = Column(Integer, default=0)      # packing progress

    # Relationships
    order = relationship("Order", back_populates="items")