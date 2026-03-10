from sqlalchemy import Column, String, Numeric, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Product(BaseModel):
    """
    Represents a product type that can be associated with orders.
    Each product has a Bill of Materials (BOM) defining the inventory
    items required to produce one unit.
    """
    __tablename__ = "cmt_products"

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)

    # Relationships
    bom_items = relationship(
        "ProductBOMItem",
        back_populates="product",
        cascade="all, delete-orphan",
    )
    orders = relationship("Order", back_populates="product")


class ProductBOMItem(BaseModel):
    """
    A single line in a product's Bill of Materials.

    The material_quantity / covers_quantity ratio expresses consumption rate:
      - material_quantity=1, covers_quantity=150  → 1 roll covers 150 pieces
      - material_quantity=1, covers_quantity=1    → 1 zip per piece
    """
    __tablename__ = "cmt_product_bom_items"

    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cmt_products.id"),
        nullable=False,
    )
    inventory_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cmt_inventory_items.id"),
        nullable=False,
    )
    # How many units of the inventory item are consumed per covers_quantity pieces
    material_quantity = Column(Numeric(10, 4), nullable=False)
    # Number of product pieces covered by material_quantity units of inventory
    covers_quantity = Column(Numeric(10, 4), nullable=False, default=1)
    # Which department consumes this material: "stitching" | "packing"
    department = Column(String(20), nullable=False)
    notes = Column(String(200), nullable=True)

    # Relationships
    product = relationship("Product", back_populates="bom_items")
    inventory_item = relationship("InventoryItem")
