from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.production import ProductionSession
from app.models.orders import Order, OrderItem
from app.schemas.production import ProductionSessionCreate
from app.services.audit_service import AuditService


class ProductionService:
    @staticmethod
    def log_session(db: Session, data: ProductionSessionCreate, user_id: UUID) -> ProductionSession:
        # Verify order exists
        order = db.query(Order).filter(Order.id == data.order_id, Order.is_deleted.is_(False)).first()
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

        session = ProductionSession(
            order_id=data.order_id,
            department=data.department.value,
            session_date=data.session_date,
            machines_used=data.machines_used,
            start_time=data.start_time,
            end_time=data.end_time,
            duration_hours=data.duration_hours,
            supervisor_id=user_id,
            notes=data.notes,
        )
        db.add(session)
        AuditService.log_create(db, "cmt_production_sessions", session.id, {"department": data.department.value}, user_id)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def get_for_order(
        db: Session,
        order_id: UUID,
        department: Optional[str] = None,
    ) -> list[ProductionSession]:
        q = (
            db.query(ProductionSession)
            .options(joinedload(ProductionSession.order))
            .filter(
                ProductionSession.order_id == order_id,
                ProductionSession.is_deleted.is_(False),
            )
        )
        if department:
            q = q.filter(ProductionSession.department == department)
        return q.order_by(ProductionSession.session_date.asc()).all()
