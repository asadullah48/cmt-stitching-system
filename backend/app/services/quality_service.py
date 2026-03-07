from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.quality import QualityCheckpoint, DefectLog, CHECKPOINT_NAMES
from app.models.orders import Order
from app.schemas.quality import CheckpointUpdate, DefectLogCreate


class QualityService:
    @staticmethod
    def get_or_create_checkpoints(db: Session, order_id: UUID) -> list[QualityCheckpoint]:
        existing = (
            db.query(QualityCheckpoint)
            .filter(QualityCheckpoint.order_id == order_id, QualityCheckpoint.is_deleted.is_(False))
            .all()
        )
        existing_names = {c.checkpoint_name for c in existing}
        for name in CHECKPOINT_NAMES:
            if name not in existing_names:
                db.add(QualityCheckpoint(order_id=order_id, checkpoint_name=name, passed=False))
        db.commit()
        return (
            db.query(QualityCheckpoint)
            .filter(QualityCheckpoint.order_id == order_id, QualityCheckpoint.is_deleted.is_(False))
            .all()
        )

    @staticmethod
    def update_checkpoint(db: Session, checkpoint_id: UUID, data: CheckpointUpdate) -> QualityCheckpoint:
        cp = db.query(QualityCheckpoint).filter(QualityCheckpoint.id == checkpoint_id).first()
        if not cp:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Checkpoint not found")
        cp.passed = data.passed
        cp.notes = data.notes
        cp.checked_at = datetime.now(timezone.utc) if data.passed else None
        db.commit()
        db.refresh(cp)
        return cp

    @staticmethod
    def log_defect(db: Session, data: DefectLogCreate) -> DefectLog:
        log = DefectLog(**data.model_dump())
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_defects(db: Session, order_id: UUID) -> list[DefectLog]:
        return (
            db.query(DefectLog)
            .filter(DefectLog.order_id == order_id, DefectLog.is_deleted.is_(False))
            .order_by(DefectLog.logged_at.desc())
            .all()
        )
