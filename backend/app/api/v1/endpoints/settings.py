from fastapi import APIRouter
from app.core.deps import CurrentUser, DbDep
from app.models.config import Config
from app.schemas.settings import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULTS = {
    "business_name": "CMT Stitching & Packing",
    "owner_name": "Admin",
    "no_bill_alert_days": "3",
    "goods_on_hold_alert_days": "5",
    "outstanding_alert_days": "30",
    "rate_deviation_pct": "10",
}


def _get(db, key: str) -> str:
    row = db.query(Config).filter(Config.key == key).first()
    return row.value if row else DEFAULTS[key]


def _set(db, key: str, value: str, user_id):
    row = db.query(Config).filter(Config.key == key).first()
    if row:
        row.value = value
        row.updated_by = user_id
    else:
        db.add(Config(key=key, value=value, updated_by=user_id))


@router.get("/", response_model=SettingsOut)
def get_settings(db: DbDep, _: CurrentUser):
    return SettingsOut(
        business_name=_get(db, "business_name"),
        owner_name=_get(db, "owner_name"),
        no_bill_alert_days=int(_get(db, "no_bill_alert_days")),
        goods_on_hold_alert_days=int(_get(db, "goods_on_hold_alert_days")),
        outstanding_alert_days=int(_get(db, "outstanding_alert_days")),
        rate_deviation_pct=int(_get(db, "rate_deviation_pct")),
    )


@router.put("/", response_model=SettingsOut)
def update_settings(data: SettingsUpdate, db: DbDep, current_user: CurrentUser):
    mapping = {
        "business_name": data.business_name,
        "owner_name": data.owner_name,
        "no_bill_alert_days": str(data.no_bill_alert_days) if data.no_bill_alert_days is not None else None,
        "goods_on_hold_alert_days": str(data.goods_on_hold_alert_days) if data.goods_on_hold_alert_days is not None else None,
        "outstanding_alert_days": str(data.outstanding_alert_days) if data.outstanding_alert_days is not None else None,
        "rate_deviation_pct": str(data.rate_deviation_pct) if data.rate_deviation_pct is not None else None,
    }
    for key, val in mapping.items():
        if val is not None:
            _set(db, key, val, current_user.id)
    db.commit()
    return get_settings(db, current_user)
