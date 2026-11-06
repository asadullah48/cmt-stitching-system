from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DailyOrder(BaseModel):
    id: UUID
    order_number: str
    goods_description: str
    total_quantity: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class DailyStage(BaseModel):
    stage: str
    orders: list[DailyOrder]
    total_quantity: int


class DailyTodo(BaseModel):
    id: UUID
    title: str
    priority: str
    due_date: datetime | None
    order_id: UUID
    order_number: str


class DailyInventoryItem(BaseModel):
    id: UUID
    name: str
    unit: str
    current_stock: Decimal
    minimum_stock: Decimal

    model_config = ConfigDict(from_attributes=True)


class DailyOverheadDue(BaseModel):
    id: UUID
    title: str
    amount: Decimal
    due_date: date

    model_config = ConfigDict(from_attributes=True)


class DailyReport(BaseModel):
    date: date
    orders_dispatched: list[DailyOrder]
    ready_for_dispatch: list[DailyOrder]
    in_progress: list[DailyStage]
    open_order_todos: list[DailyTodo]
    low_stock_items: list[DailyInventoryItem]
    overhead_due: list[DailyOverheadDue]
    overhead_due_total: Decimal

