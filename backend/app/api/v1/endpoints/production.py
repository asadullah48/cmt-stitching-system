from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbDep
from app.schemas.production import ProductionSessionCreate, ProductionSessionOut
from app.services.production_service import ProductionService

router = APIRouter(prefix="/production", tags=["production"])


def _to_out(session) -> ProductionSessionOut:
    return ProductionSessionOut(
        id=session.id,
        order_id=session.order_id,
        order_number=session.order.order_number if session.order else None,
        department=session.department,
        session_date=session.session_date,
        machines_used=session.machines_used,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_hours=session.duration_hours,
        notes=session.notes,
    )


@router.post("/", response_model=ProductionSessionOut, status_code=201)
def log_session(data: ProductionSessionCreate, db: DbDep, current_user: CurrentUser):
    session = ProductionService.log_session(db, data, current_user.id)
    return _to_out(session)


@router.get("/{order_id}", response_model=list[ProductionSessionOut])
def get_sessions(
    order_id: UUID,
    db: DbDep,
    _: CurrentUser,
    department: Optional[str] = Query(None, pattern="^(stitching|packing)$"),
):
    sessions = ProductionService.get_for_order(db, order_id, department)
    return [_to_out(s) for s in sessions]
