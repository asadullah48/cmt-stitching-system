from sqlalchemy import Column, String, Numeric, ForeignKey, Date, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import BaseModel


class InventoryCategory(BaseModel):
    __tablename__ = "cmt_inventory_categories"

    name = Column(String(50), nullable=False)
    category_type = Column(String(20), nullable=False)  # raw_material, finished_goods, accessories

    # Relationships
    items = relationship("InventoryItem", back_populates="category")


class InventoryItem(BaseModel):
    __tablename__ = "cmt_inventory_items"

    category_id = Column(UUID(as_uuid=True), ForeignKey("cmt_inventory_categories.id"), nullable=True)
    name = Column(String(100), nullable=False)
    sku = Column(String(50), unique=True, nullable=True)
    unit = Column(String(20), nullable=False)
    current_stock = Column(Numeric(10, 2), default=0)
    minimum_stock = Column(Numeric(10, 2), default=0)
    cost_per_unit = Column(Numeric(10, 2), nullable=True)
    location = Column(String(100), nullable=True)   # e.g. "Rack A", "Warehouse 1"
    condition = Column(String(20), nullable=True, default="good")  # good | damaged | expired

    # Relationships
    category = relationship("InventoryCategory", back_populates="items")
    transactions = relationship("InventoryTransaction", back_populates="item")


class InventoryTransaction(BaseModel):
    __tablename__ = "cmt_inventory_transactions"

    item_id = Column(UUID(as_uuid=True), ForeignKey("cmt_inventory_items.id"), nullable=False)
    transaction_type = Column(String(20), nullable=False)  # purchase, consumption, adjustment, return
    quantity = Column(Numeric(10, 2), nullable=False)
    unit_cost = Column(Numeric(10, 2))
    total_cost = Column(Numeric(10, 2))
    reference_id = Column(UUID(as_uuid=True))
    reference_type = Column(String(50))
    order_number = Column(String(50), nullable=True)    # e.g. ORD-202603-0002
    bill_number = Column(String(50), nullable=True)     # e.g. A52
    party_reference = Column(String(100), nullable=True)  # supplier name
    notes = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    transaction_date = Column(Date, nullable=False)

    # Relationships
    item = relationship("InventoryItem", back_populates="transactions")
    creator = relationship("User")
