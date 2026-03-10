import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def _jsonify(obj):
    """Recursively convert non-JSON-serializable types in a dict."""
    if isinstance(obj, dict):
        return {k: _jsonify(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonify(v) for v in obj]
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    return obj


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
            old_values=_jsonify(old_values),
            new_values=_jsonify(new_values),
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
