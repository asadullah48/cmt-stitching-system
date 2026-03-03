from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship
from .base import BaseModel

class User(BaseModel):
    __tablename__ = "cmt_users"
    
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # admin, operator, accountant
    is_active = Column(Boolean, default=True)
    
    # Relationships
    created_orders = relationship("Order", back_populates="creator")
    created_expenses = relationship("Expense", back_populates="creator")
    audit_logs = relationship("AuditLog", back_populates="user")