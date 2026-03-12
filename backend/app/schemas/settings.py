from typing import Optional
from pydantic import BaseModel


class SettingsOut(BaseModel):
    business_name: str
    owner_name: str
    no_bill_alert_days: int
    goods_on_hold_alert_days: int
    outstanding_alert_days: int
    rate_deviation_pct: int


class SettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    no_bill_alert_days: Optional[int] = None
    goods_on_hold_alert_days: Optional[int] = None
    outstanding_alert_days: Optional[int] = None
    rate_deviation_pct: Optional[int] = None
