from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Todo(BaseModel):
    __tablename__ = "cmt_todos"

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # pending | in_progress | completed
    status = Column(String(20), default="pending", nullable=False)
    # low | medium | high | urgent
    priority = Column(String(10), default="medium", nullable=False)
    # billing | maintenance | workflow | order | other
    category = Column(String(20), default="other", nullable=False)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    # Optional link to an order
    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    # Who owns this todo
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    # Recurrence: daily | weekly | monthly | custom | None
    recurrence = Column(String(10), nullable=True)
    # For custom recurrence: every N days
    recurrence_days = Column(Integer, nullable=True)
    # Points back to the "template" todo that spawned this recurring instance
    parent_todo_id = Column(UUID(as_uuid=True), ForeignKey("cmt_todos.id"), nullable=True)

    order = relationship("Order", foreign_keys=[order_id])
    assigned_user = relationship("User", foreign_keys=[assigned_to])
