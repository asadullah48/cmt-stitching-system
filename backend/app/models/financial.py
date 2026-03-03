from sqlalchemy import Column, String, Numeric, Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class FinancialTransaction(BaseModel):
    __tablename__ = "cmt_financial_transactions"

    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    transaction_type = Column(String(20), nullable=False)  # income, payment, adjustment
    amount = Column(Numeric(10, 2), nullable=False)
    payment_method = Column(String(20))
    reference_number = Column(String(50))
    description = Column(Text)
    transaction_date = Column(Date, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    party = relationship("Party", back_populates="transactions")
    order = relationship("Order", back_populates="transactions")
    creator = relationship("User")
