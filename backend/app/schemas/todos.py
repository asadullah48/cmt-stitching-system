from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class TodoStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class TodoPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TodoCategory(str, Enum):
    billing = "billing"
    maintenance = "maintenance"
    workflow = "workflow"
    order = "order"
    other = "other"


class TodoRecurrence(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    custom = "custom"


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: TodoStatus = TodoStatus.pending
    priority: TodoPriority = TodoPriority.medium
    category: TodoCategory = TodoCategory.other
    due_date: Optional[datetime] = None
    order_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    recurrence: Optional[TodoRecurrence] = None
    recurrence_days: Optional[int] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TodoStatus] = None
    priority: Optional[TodoPriority] = None
    category: Optional[TodoCategory] = None
    due_date: Optional[datetime] = None
    order_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    recurrence: Optional[TodoRecurrence] = None
    recurrence_days: Optional[int] = None


class TodoOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    status: str
    priority: str
    category: str
    due_date: Optional[datetime]
    completed_at: Optional[datetime]
    order_id: Optional[UUID]
    order_number: Optional[str] = None
    assigned_to: Optional[UUID]
    assigned_username: Optional[str] = None
    recurrence: Optional[str]
    recurrence_days: Optional[int]
    parent_todo_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TodoListResponse(BaseModel):
    data: list[TodoOut]
    total: int
