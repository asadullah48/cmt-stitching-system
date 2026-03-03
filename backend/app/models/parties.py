from sqlalchemy import Column, String, Integer, Text, Numeric
from sqlalchemy.orm import relationship
from .base import BaseModel

class Party(BaseModel):
    __tablename__ = "cmt_parties"

    name = Column(String(100), nullable=False)
    contact_person = Column(String(100))
    phone = Column(String(20))
    email = Column(String(100))
    address = Column(Text)
    payment_terms = Column(Integer, default=30)
    balance = Column(Numeric(10, 2), nullable=False, default=0)

    # Relationships
    orders = relationship("Order", back_populates="party")
    transactions = relationship("FinancialTransaction", back_populates="party")