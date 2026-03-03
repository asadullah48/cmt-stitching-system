import uuid
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


class AuditService:
    @staticmethod
    def log(
        db: Session,
        table_name: str,
        record_id: UUID,
        action: str,
        user_id: Optional[UUID],
        old_values: Optional[dict] = None,
        new_values: Optional[dict] = None,
    ) -> None:
        log = AuditLog(
            table_name=table_name,
            record_id=record_id,
            action=action,
            user_id=user_id,
            old_values=old_values,
            new_values=new_values,
        )
        db.add(log)
        # Flushed as part of the caller's transaction — no separate commit here

    @staticmethod
    def log_create(db: Session, table: str, record_id: UUID, new_values: dict, user_id: Optional[UUID]) -> None:
        AuditService.log(db, table, record_id, "create", user_id, new_values=new_values)

    @staticmethod
    def log_update(db: Session, table: str, record_id: UUID, old_values: dict, new_values: dict, user_id: Optional[UUID]) -> None:
        AuditService.log(db, table, record_id, "update", user_id, old_values=old_values, new_values=new_values)

    @staticmethod
    def log_delete(db: Session, table: str, record_id: UUID, user_id: Optional[UUID]) -> None:
        AuditService.log(db, table, record_id, "delete", user_id)
