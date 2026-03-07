from decimal import Decimal
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from .orders import OrderOut


class DashboardSummary(BaseModel):
    total_orders: int
    pending_orders: int
    stitching_in_progress: int
    stitching_complete: int
    packing_in_progress: int
    packing_complete: int
    dispatched: int
    total_revenue_month: Decimal
    recent_orders: list
    completed_today: int = 0
    active_orders: int = 0
    on_hold_orders: int = 0
    stitching_progress_pct: float = 0.0
    packing_progress_pct: float = 0.0
