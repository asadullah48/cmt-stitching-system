from sqlalchemy import Column, String, Text, Numeric
from sqlalchemy.orm import relationship
from .base import BaseModel

class Party(BaseModel):
    __tablename__ = "cmt_parties"

    name = Column(String(100), nullable=False)
    party_type = Column(String(10), nullable=False, default="customer")  # customer | labour | vendor
    contact_person = Column(String(100))
    phone = Column(String(20))
    email = Column(String(100))
    address = Column(Text)
    payment_terms = Column(String(100))
    balance = Column(Numeric(10, 2), nullable=False, default=0)

    # Relationships
    orders = relationship("Order", back_populates="party")
    transactions = relationship("FinancialTransaction", back_populates="party")
    bills = relationship("Bill", back_populates="party")