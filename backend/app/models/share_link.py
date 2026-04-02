import uuid
from sqlalchemy import Column, Boolean, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class ShareLink(Base):
    __tablename__ = "cmt_share_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token = Column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    party_id = Column(UUID(as_uuid=True), ForeignKey("cmt_parties.id"), nullable=False)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_revoked = Column(Boolean, nullable=False, default=False)

    party = relationship("Party")
    creator = relationship("User")
