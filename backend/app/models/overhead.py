from sqlalchemy import Column, String, Numeric, Date, DateTime, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class CashAccount(BaseModel):
    __tablename__ = "cmt_cash_accounts"

    name = Column(String(100), nullable=False)          # "Cash In Hand" | "Bank"
    account_type = Column(String(10), nullable=False)   # cash | bank
    opening_balance = Column(Numeric(12, 2), default=0, nullable=False)
    reserve_amount = Column(Numeric(12, 2), default=0, nullable=False)  # minimum to keep in account
    note = Column(String(200), nullable=True)           # e.g. bank name / account number

    entries = relationship("CashEntry", back_populates="account")


class CashEntry(BaseModel):
    __tablename__ = "cmt_cash_entries"

    account_id = Column(UUID(as_uuid=True), ForeignKey("cmt_cash_accounts.id"), nullable=False)
    entry_type = Column(String(10), nullable=False)     # credit | debit
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(String(200), nullable=False)
    entry_date = Column(Date, nullable=False)
    source = Column(String(20), nullable=True)          # overhead | manual
    source_id = Column(UUID(as_uuid=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    account = relationship("CashAccount", back_populates="entries")
    creator = relationship("User", foreign_keys=[created_by])


class OverheadExpense(BaseModel):
    __tablename__ = "cmt_overhead_expenses"

    title = Column(String(200), nullable=False)
    category = Column(String(20), nullable=False, default="other")  # rent|wages|utilities|insurance|other
    amount = Column(Numeric(12, 2), nullable=False)
    due_date = Column(Date, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(10), nullable=False, default="unpaid")   # unpaid | paid
    paid_date = Column(Date, nullable=True)
    paid_from_account_id = Column(UUID(as_uuid=True), ForeignKey("cmt_cash_accounts.id"), nullable=True)
    recurrence = Column(String(10), nullable=True)      # monthly | weekly | custom | None
    recurrence_days = Column(Integer, nullable=True)
    parent_expense_id = Column(UUID(as_uuid=True), ForeignKey("cmt_overhead_expenses.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)

    paid_from_account = relationship("CashAccount", foreign_keys=[paid_from_account_id])
    creator = relationship("User", foreign_keys=[created_by])
