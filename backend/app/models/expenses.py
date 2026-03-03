from sqlalchemy import Column, String, Numeric, Boolean, Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import BaseModel


class ExpenseCategory(BaseModel):
    __tablename__ = "cmt_expense_categories"

    name = Column(String(50), nullable=False)
    category_type = Column(String(20), nullable=False)  # variable, overhead, labor
    is_active = Column(Boolean, default=True)

    # Relationships
    expenses = relationship("Expense", back_populates="category")


class Expense(BaseModel):
    __tablename__ = "cmt_expenses"

    category_id = Column(UUID(as_uuid=True), ForeignKey("cmt_expense_categories.id"), nullable=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)  # NULL for overhead
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(Text)
    expense_date = Column(Date, nullable=False)
    receipt_number = Column(String(50))
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    category = relationship("ExpenseCategory", back_populates="expenses")
    order = relationship("Order", back_populates="expenses")
    creator = relationship("User", back_populates="created_expenses")
