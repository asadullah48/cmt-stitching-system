from sqlalchemy import Column, String, Integer, Numeric, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Bill(BaseModel):
    __tablename__ = "cmt_bills"

    bill_number = Column(String(20), unique=True, nullable=False)   # e.g. "A51", "B07"
    bill_series = Column(String(5), nullable=False)                  # "A", "B"
    bill_sequence = Column(Integer, nullable=False)                  # 51, 7

    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=True)

    bill_date = Column(Date, nullable=False)
    carrier = Column(String(50), nullable=True)
    tracking_number = Column(String(100), nullable=True)
    carton_count = Column(Integer, nullable=True)
    total_weight = Column(Numeric(8, 2), nullable=True)

    # payment_status: unpaid | partial | paid
    payment_status = Column(String(20), default="unpaid", nullable=False)
    amount_due = Column(Numeric(10, 2), nullable=False)
    amount_paid = Column(Numeric(10, 2), default=0, nullable=False)
    discount = Column(Numeric(10, 2), default=0, nullable=False, server_default="0")
    previous_balance = Column(Numeric(10, 2), default=0, nullable=False, server_default="0")

    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    # Relationships
    order = relationship("Order", back_populates="bill", uselist=False)
    party = relationship("Party", back_populates="bills")
    creator = relationship("User")
    transactions = relationship(
        "FinancialTransaction",
        back_populates="bill",
        foreign_keys="FinancialTransaction.bill_id",
        primaryjoin="Bill.id == FinancialTransaction.bill_id",
    )
