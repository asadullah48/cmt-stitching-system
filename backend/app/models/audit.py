import uuid
from datetime import datetime

from sqlalchemy import Column, String, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .base import Base


class AuditLog(Base):
    __tablename__ = "cmt_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_name = Column(String(50), nullable=False)
    record_id = Column(UUID(as_uuid=True), nullable=False)
    action = Column(String(20), nullable=False)  # create, update, delete
    old_values = Column(JSONB)
    new_values = Column(JSONB)
    user_id = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    timestamp = Column(TIMESTAMP, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="audit_logs")
