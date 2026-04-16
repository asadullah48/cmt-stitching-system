from uuid import UUID
from fastapi import APIRouter, HTTPException
from app.core.deps import CurrentUser, DbDep
from app.models.bill_rate_templates import BillRateTemplate
from app.schemas.bill_rate_templates import BillRateTemplateOut, BillRateTemplateUpdate

router = APIRouter(prefix="/bill-rate-templates", tags=["bill-rate-templates"])


@router.get("/", response_model=list[BillRateTemplateOut])
def list_templates(db: DbDep, _: CurrentUser):
    return (
        db.query(BillRateTemplate)
        .filter(BillRateTemplate.is_deleted.is_(False))
        .order_by(BillRateTemplate.goods_type, BillRateTemplate.bill_series)
        .all()
    )


@router.patch("/{template_id}", response_model=BillRateTemplateOut)
def update_template(template_id: UUID, payload: BillRateTemplateUpdate, db: DbDep, _: CurrentUser):
    tmpl = db.query(BillRateTemplate).filter(
        BillRateTemplate.id == template_id,
        BillRateTemplate.is_deleted.is_(False),
    ).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tmpl, field, value)
    db.commit()
    db.refresh(tmpl)
    return tmpl
