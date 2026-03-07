from uuid import UUID
from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DbDep
from app.models.orders import Order
from app.schemas.quality import (
    CheckpointOut, CheckpointUpdate, DefectLogCreate, DefectLogOut, QualityReport,
)
from app.services.quality_service import QualityService

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/{order_id}", response_model=QualityReport)
def get_quality_report(order_id: UUID, db: DbDep, _: CurrentUser):
    order = db.query(Order).filter(Order.id == order_id, Order.is_deleted.is_(False)).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    checkpoints = QualityService.get_or_create_checkpoints(db, order_id)
    defects = QualityService.get_defects(db, order_id)
    return QualityReport(
        order_id=order.id,
        order_number=order.order_number,
        checkpoints=checkpoints,
        defects=defects,
        all_passed=all(c.passed for c in checkpoints),
    )


@router.patch("/checkpoints/{checkpoint_id}", response_model=CheckpointOut)
def update_checkpoint(checkpoint_id: UUID, data: CheckpointUpdate, db: DbDep, _: CurrentUser):
    return QualityService.update_checkpoint(db, checkpoint_id, data)


@router.post("/defects", response_model=DefectLogOut, status_code=201)
def log_defect(data: DefectLogCreate, db: DbDep, _: CurrentUser):
    return QualityService.log_defect(db, data)
