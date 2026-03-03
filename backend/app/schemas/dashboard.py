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
