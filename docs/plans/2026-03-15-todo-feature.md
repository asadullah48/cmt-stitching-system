# Todo Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-featured todo system with recurring tasks, priority/category tagging, optional order-linking, due date indicators, a dedicated `/todos` page (kanban-style), and a floating quick-add button visible on every page.

**Architecture:** New `cmt_todos` table with recurrence support; FastAPI router at `/todos`; frontend page + floating widget in the shared dashboard layout. Recurring todos auto-spawn the next instance when completed.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend); Next.js 15 + TailwindCSS v4 + React Context (frontend); uv for Python deps.

---

## Task 1: Backend Model

**Files:**
- Create: `backend/app/models/todos.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model**

```python
# backend/app/models/todos.py
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import BaseModel


class Todo(BaseModel):
    __tablename__ = "cmt_todos"

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    # pending | in_progress | completed
    status = Column(String(20), default="pending", nullable=False)
    # low | medium | high | urgent
    priority = Column(String(10), default="medium", nullable=False)
    # billing | maintenance | workflow | order | other
    category = Column(String(20), default="other", nullable=False)
    due_date = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    # Optional link to an order
    order_id = Column(UUID(as_uuid=True), ForeignKey("cmt_orders.id"), nullable=True)
    # Who owns this todo
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("cmt_users.id"), nullable=True)
    # Recurrence: daily | weekly | monthly | custom | None
    recurrence = Column(String(10), nullable=True)
    # For custom recurrence: every N days
    recurrence_days = Column(Integer, nullable=True)
    # Points back to the "template" todo that spawned this recurring instance
    parent_todo_id = Column(UUID(as_uuid=True), ForeignKey("cmt_todos.id"), nullable=True)

    order = relationship("Order", foreign_keys=[order_id])
    assigned_user = relationship("User", foreign_keys=[assigned_to])
```

**Step 2: Add import to `backend/app/models/__init__.py`**

Open the file and add:
```python
from .todos import Todo
```

**Step 3: Commit**

```bash
git add backend/app/models/todos.py backend/app/models/__init__.py
git commit -m "feat: add Todo model for todo feature"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/n4i5j6k7l8m9_add_todos_table.py` (ABSOLUTE PATH: `C:\Users\Asad\cmt-stitching-system\backend\alembic\versions\n4i5j6k7l8m9_add_todos_table.py`)

**Step 1: Create the migration file**

```python
"""add todos table

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-03-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'n4i5j6k7l8m9'
down_revision = 'm3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cmt_todos',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('priority', sa.String(10), nullable=False, server_default='medium'),
        sa.Column('category', sa.String(20), nullable=False, server_default='other'),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('order_id', UUID(as_uuid=True), sa.ForeignKey('cmt_orders.id'), nullable=True),
        sa.Column('assigned_to', UUID(as_uuid=True), sa.ForeignKey('cmt_users.id'), nullable=True),
        sa.Column('recurrence', sa.String(10), nullable=True),
        sa.Column('recurrence_days', sa.Integer(), nullable=True),
        sa.Column('parent_todo_id', UUID(as_uuid=True), sa.ForeignKey('cmt_todos.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_cmt_todos_status', 'cmt_todos', ['status'])
    op.create_index('ix_cmt_todos_assigned_to', 'cmt_todos', ['assigned_to'])
    op.create_index('ix_cmt_todos_due_date', 'cmt_todos', ['due_date'])


def downgrade():
    op.drop_index('ix_cmt_todos_due_date', table_name='cmt_todos')
    op.drop_index('ix_cmt_todos_assigned_to', table_name='cmt_todos')
    op.drop_index('ix_cmt_todos_status', table_name='cmt_todos')
    op.drop_table('cmt_todos')
```

**Step 2: Run migration**

```bash
cd backend
uv run alembic upgrade head
```

Expected: `Running upgrade m3h4i5j6k7l8 -> n4i5j6k7l8m9, add todos table`

**Step 3: Commit**

```bash
git add backend/alembic/versions/n4i5j6k7l8m9_add_todos_table.py
git commit -m "feat: add todos table migration"
```

---

## Task 3: Backend Schemas

**Files:**
- Create: `backend/app/schemas/todos.py`

**Step 1: Create schemas**

```python
# backend/app/schemas/todos.py
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
```

**Step 2: Commit**

```bash
git add backend/app/schemas/todos.py
git commit -m "feat: add todo pydantic schemas"
```

---

## Task 4: Backend Endpoint

**Files:**
- Create: `backend/app/api/v1/endpoints/todos.py`

**Step 1: Create the endpoint**

```python
# backend/app/api/v1/endpoints/todos.py
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_

from app.core.deps import CurrentUser, DbDep
from app.models.todos import Todo
from app.schemas.todos import TodoCreate, TodoUpdate, TodoOut, TodoListResponse

router = APIRouter(prefix="/todos", tags=["todos"])


def _to_out(todo: Todo) -> TodoOut:
    return TodoOut(
        id=todo.id,
        title=todo.title,
        description=todo.description,
        status=todo.status,
        priority=todo.priority,
        category=todo.category,
        due_date=todo.due_date,
        completed_at=todo.completed_at,
        order_id=todo.order_id,
        order_number=todo.order.order_number if todo.order else None,
        assigned_to=todo.assigned_to,
        assigned_username=todo.assigned_user.username if todo.assigned_user else None,
        recurrence=todo.recurrence,
        recurrence_days=todo.recurrence_days,
        parent_todo_id=todo.parent_todo_id,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
    )


def _spawn_next_recurring(db, todo: Todo) -> None:
    """Auto-create the next instance of a recurring todo."""
    if not todo.recurrence:
        return

    now = datetime.utcnow()
    if todo.recurrence == "daily":
        next_due = (todo.due_date or now) + timedelta(days=1)
    elif todo.recurrence == "weekly":
        next_due = (todo.due_date or now) + timedelta(weeks=1)
    elif todo.recurrence == "monthly":
        next_due = (todo.due_date or now) + timedelta(days=30)
    elif todo.recurrence == "custom" and todo.recurrence_days:
        next_due = (todo.due_date or now) + timedelta(days=todo.recurrence_days)
    else:
        return

    next_todo = Todo(
        title=todo.title,
        description=todo.description,
        status="pending",
        priority=todo.priority,
        category=todo.category,
        due_date=next_due,
        order_id=todo.order_id,
        assigned_to=todo.assigned_to,
        recurrence=todo.recurrence,
        recurrence_days=todo.recurrence_days,
        parent_todo_id=todo.id,
    )
    db.add(next_todo)


@router.get("/", response_model=TodoListResponse)
def list_todos(
    db: DbDep,
    current_user: CurrentUser,
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    q = db.query(Todo).filter(Todo.is_deleted == False)

    if status_filter:
        q = q.filter(Todo.status == status_filter)
    if priority:
        q = q.filter(Todo.priority == priority)
    if category:
        q = q.filter(Todo.category == category)
    if overdue_only:
        q = q.filter(
            and_(Todo.due_date < datetime.utcnow(), Todo.status != "completed")
        )

    total = q.count()
    todos = q.order_by(Todo.due_date.asc().nullslast(), Todo.created_at.desc()) \
             .offset((page - 1) * size).limit(size).all()

    return TodoListResponse(data=[_to_out(t) for t in todos], total=total)


@router.post("/", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(payload: TodoCreate, db: DbDep, current_user: CurrentUser):
    todo = Todo(
        title=payload.title,
        description=payload.description,
        status=payload.status.value,
        priority=payload.priority.value,
        category=payload.category.value,
        due_date=payload.due_date,
        order_id=payload.order_id,
        assigned_to=payload.assigned_to or current_user.id,
        recurrence=payload.recurrence.value if payload.recurrence else None,
        recurrence_days=payload.recurrence_days,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return _to_out(todo)


@router.get("/{todo_id}", response_model=TodoOut)
def get_todo(todo_id: UUID, db: DbDep, current_user: CurrentUser):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.is_deleted == False).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return _to_out(todo)


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(todo_id: UUID, payload: TodoUpdate, db: DbDep, current_user: CurrentUser):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.is_deleted == False).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if hasattr(value, 'value'):
            setattr(todo, field, value.value)
        else:
            setattr(todo, field, value)

    db.commit()
    db.refresh(todo)
    return _to_out(todo)


@router.patch("/{todo_id}/complete", response_model=TodoOut)
def complete_todo(todo_id: UUID, db: DbDep, current_user: CurrentUser):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.is_deleted == False).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo.status = "completed"
    todo.completed_at = datetime.utcnow()

    # Spawn next recurring instance
    _spawn_next_recurring(db, todo)

    db.commit()
    db.refresh(todo)
    return _to_out(todo)


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo(todo_id: UUID, db: DbDep, current_user: CurrentUser):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.is_deleted == False).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    todo.is_deleted = True
    todo.deleted_at = datetime.utcnow()
    db.commit()
```

**Step 2: Commit**

```bash
git add backend/app/api/v1/endpoints/todos.py
git commit -m "feat: add todos API endpoint"
```

---

## Task 5: Register Router

**Files:**
- Modify: `backend/app/api/v1/router.py`

**Step 1: Add the import and include_router**

Add to top imports:
```python
from .endpoints.todos import router as todos_router
```

Add after the last `api_router.include_router(...)`:
```python
api_router.include_router(todos_router)
```

**Step 2: Verify locally**

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8001
# Visit http://localhost:8001/docs and confirm /todos endpoints appear
```

**Step 3: Commit**

```bash
git add backend/app/api/v1/router.py
git commit -m "feat: register todos router"
```

---

## Task 6: Frontend Types + Services

**Files:**
- Modify: `frontend/src/hooks/types.ts`
- Modify: `frontend/src/hooks/services.ts`
- Modify: `frontend/src/hooks/services.tsx` (must mirror services.ts)

**Step 1: Add types to `types.ts`**

Append at the end of the file:
```typescript
// ─── Todos ───────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoCategory = "billing" | "maintenance" | "workflow" | "order" | "other";
export type TodoRecurrence = "daily" | "weekly" | "monthly" | "custom";

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  category: TodoCategory;
  due_date: string | null;
  completed_at: string | null;
  order_id: string | null;
  order_number: string | null;
  assigned_to: string | null;
  assigned_username: string | null;
  recurrence: TodoRecurrence | null;
  recurrence_days: number | null;
  parent_todo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoCreate {
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: TodoCategory;
  due_date?: string;
  order_id?: string;
  assigned_to?: string;
  recurrence?: TodoRecurrence;
  recurrence_days?: number;
}

export type TodoUpdate = Partial<TodoCreate>;

export interface TodoListResponse {
  data: Todo[];
  total: number;
}

export interface TodoFilters {
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: TodoCategory;
  overdue_only?: boolean;
  page?: number;
  size?: number;
}
```

**Step 2: Add API functions to `services.ts`**

First add the new types to the import block at the top of `services.ts`:
```typescript
  Todo,
  TodoCreate,
  TodoUpdate,
  TodoListResponse,
  TodoFilters,
```

Then append the todo service functions at the end of the file:
```typescript
// ─── Todos ───────────────────────────────────────────────────────────────────

export const todoService = {
  list: (filters: TodoFilters = {}): Promise<TodoListResponse> => {
    const params: Record<string, string | number | boolean> = {};
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.category) params.category = filters.category;
    if (filters.overdue_only) params.overdue_only = true;
    if (filters.page) params.page = filters.page;
    if (filters.size) params.size = filters.size;
    return api.get("/todos/", { params }).then((r) => r.data);
  },

  get: (id: string): Promise<Todo> =>
    api.get(`/todos/${id}`).then((r) => r.data),

  create: (data: TodoCreate): Promise<Todo> =>
    api.post("/todos/", data).then((r) => r.data),

  update: (id: string, data: TodoUpdate): Promise<Todo> =>
    api.patch(`/todos/${id}`, data).then((r) => r.data),

  complete: (id: string): Promise<Todo> =>
    api.patch(`/todos/${id}/complete`).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/todos/${id}`).then(() => undefined),
};
```

**Step 3: Mirror the same changes in `services.tsx`**

Open `frontend/src/hooks/services.tsx` and apply the exact same additions (import types + append `todoService`). The two files must stay in sync.

**Step 4: Commit**

```bash
git add frontend/src/hooks/types.ts frontend/src/hooks/services.ts frontend/src/hooks/services.tsx
git commit -m "feat: add todo types and service layer"
```

---

## Task 7: Frontend Todos Page

**Files:**
- Create: `frontend/src/app/(dashboard)/todos/page.tsx`

**Step 1: Create the page**

```tsx
// frontend/src/app/(dashboard)/todos/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { todoService } from "@/hooks/services";
import type {
  Todo, TodoCreate, TodoUpdate,
  TodoStatus, TodoPriority, TodoCategory, TodoRecurrence,
  TodoFilters,
} from "@/hooks/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dueBadge(todo: Todo) {
  if (todo.status === "completed" || !todo.due_date) return null;
  const due = new Date(todo.due_date);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffMs < 0)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Overdue</span>;
  if (diffDays < 1)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">Today</span>;
  if (diffDays <= 3)
    return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Soon</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{due.toLocaleDateString()}</span>;
}

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<TodoCategory, string> = {
  billing: "Billing",
  maintenance: "Maintenance",
  workflow: "Workflow",
  order: "Order",
  other: "Other",
};

// ─── Todo Card ────────────────────────────────────────────────────────────────

function TodoCard({
  todo,
  onComplete,
  onDelete,
  onEdit,
}: {
  todo: Todo;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Complete checkbox */}
        <button
          onClick={() => onComplete(todo.id)}
          disabled={todo.status === "completed"}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors ${
            todo.status === "completed"
              ? "bg-green-500 border-green-500"
              : "border-gray-300 hover:border-blue-500"
          }`}
        >
          {todo.status === "completed" && (
            <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Title + recurrence */}
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium ${todo.status === "completed" ? "line-through text-gray-400" : "text-gray-900"}`}>
              {todo.title}
            </p>
            {todo.recurrence && (
              <span title={`Repeats ${todo.recurrence}`} className="text-blue-400">↻</span>
            )}
          </div>

          {todo.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{todo.description}</p>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[todo.priority]}`}>
              {todo.priority}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              {CATEGORY_LABELS[todo.category]}
            </span>
            {todo.order_number && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                #{todo.order_number}
              </span>
            )}
            {dueBadge(todo)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(todo)}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(todo.id)}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  title,
  statusKey,
  todos,
  color,
  onComplete,
  onDelete,
  onEdit,
}: {
  title: string;
  statusKey: TodoStatus;
  todos: Todo[];
  color: string;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: Todo) => void;
}) {
  const filtered = todos.filter((t) => t.status === statusKey);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{filtered.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-xs text-gray-400">
            No items
          </div>
        ) : (
          filtered.map((t) => (
            <TodoCard key={t.id} todo={t} onComplete={onComplete} onDelete={onDelete} onEdit={onEdit} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Edit/Create Sheet ────────────────────────────────────────────────────────

function TodoSheet({
  todo,
  onClose,
  onSave,
}: {
  todo: Todo | null;
  onClose: () => void;
  onSave: (data: TodoCreate | TodoUpdate) => Promise<void>;
}) {
  const isEdit = !!todo;
  const [form, setForm] = useState<TodoCreate>({
    title: todo?.title ?? "",
    description: todo?.description ?? "",
    status: (todo?.status ?? "pending") as TodoStatus,
    priority: (todo?.priority ?? "medium") as TodoPriority,
    category: (todo?.category ?? "other") as TodoCategory,
    due_date: todo?.due_date ?? "",
    recurrence: (todo?.recurrence ?? "") as TodoRecurrence,
    recurrence_days: todo?.recurrence_days ?? undefined,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: TodoCreate = { ...form };
      if (!payload.description) delete payload.description;
      if (!payload.due_date) delete payload.due_date;
      if (!payload.recurrence) delete payload.recurrence;
      if (!payload.recurrence_days) delete payload.recurrence_days;
      await onSave(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? "Edit Todo" : "New Todo"}</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What needs to be done?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional details..."
            />
          </div>

          {/* Priority + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as TodoPriority }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as TodoCategory }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="billing">Billing</option>
                <option value="maintenance">Maintenance</option>
                <option value="workflow">Workflow</option>
                <option value="order">Order</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as TodoStatus }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={form.due_date ? form.due_date.slice(0, 16) : ""}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value ? e.target.value + ":00" : "" }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Recurrence</label>
            <select
              value={form.recurrence ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value as TodoRecurrence || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No recurrence</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </div>

          {form.recurrence === "custom" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Every N days</label>
              <input
                type="number"
                min={1}
                value={form.recurrence_days ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, recurrence_days: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 15"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Todo"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Add (inline, used by floating button) ──────────────────────────────

export function QuickAddTodo({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TodoCategory>("other");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await todoService.create({
        title: title.trim(),
        category,
        priority,
        due_date: dueDate || undefined,
      });
      setTitle("");
      setDueDate("");
      setOpen(false);
      onCreated?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-2xl transition-colors"
        title="Quick add todo"
      >
        +
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Quick Add Todo</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TodoCategory)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="billing">Billing</option>
            <option value="maintenance">Maintenance</option>
            <option value="workflow">Workflow</option>
            <option value="order">Order</option>
            <option value="other">Other</option>
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add Todo"}
        </button>
      </form>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TodoFilters>({});
  const [editTodo, setEditTodo] = useState<Todo | null | "new">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await todoService.list(filters);
      setTodos(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleComplete = async (id: string) => {
    await todoService.complete(id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this todo?")) return;
    await todoService.delete(id);
    load();
  };

  const handleSave = async (data: TodoCreate | TodoUpdate) => {
    if (editTodo === "new") {
      await todoService.create(data as TodoCreate);
    } else if (editTodo) {
      await todoService.update(editTodo.id, data);
    }
    load();
  };

  const overdueCount = todos.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} total{overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">{overdueCount} overdue</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setEditTodo("new")}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <span>+ New Todo</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <select
          value={filters.status ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value as TodoStatus || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filters.priority ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value as TodoPriority || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.category ?? ""}
          onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value as TodoCategory || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          <option value="billing">Billing</option>
          <option value="maintenance">Maintenance</option>
          <option value="workflow">Workflow</option>
          <option value="order">Order</option>
          <option value="other">Other</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.overdue_only ?? false}
            onChange={(e) => setFilters((p) => ({ ...p, overdue_only: e.target.checked || undefined }))}
            className="rounded"
          />
          Overdue only
        </label>
        {(filters.status || filters.priority || filters.category || filters.overdue_only) && (
          <button
            onClick={() => setFilters({})}
            className="text-xs text-blue-600 hover:underline ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Kanban columns */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Column title="Pending" statusKey="pending" todos={todos} color="bg-gray-400"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
          <Column title="In Progress" statusKey="in_progress" todos={todos} color="bg-blue-500"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
          <Column title="Completed" statusKey="completed" todos={todos} color="bg-green-500"
            onComplete={handleComplete} onDelete={handleDelete} onEdit={setEditTodo} />
        </div>
      )}

      {/* Edit / Create sheet */}
      {editTodo !== null && (
        <TodoSheet
          todo={editTodo === "new" ? null : editTodo}
          onClose={() => setEditTodo(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add "frontend/src/app/(dashboard)/todos/page.tsx"
git commit -m "feat: add todos page with kanban view and edit sheet"
```

---

## Task 8: Add Nav Item + Floating Button to Layout

**Files:**
- Modify: `frontend/src/app/(dashboard)/layout.tsx`

**Step 1: Add `IconCheckSquare` icon function**

Add this function after the existing icon functions (e.g. after `IconSettings`):

```tsx
function IconCheckSquare() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
```

**Step 2: Add Todos to `NAV_ITEMS`**

In the `NAV_ITEMS` array, add this entry after the Bills entry:
```tsx
{ label: "Todos", href: "/todos", icon: <IconCheckSquare /> },
```

**Step 3: Add floating quick-add button to layout**

First add the import for `QuickAddTodo` at the top of layout.tsx:
```tsx
import { QuickAddTodo } from "@/app/(dashboard)/todos/page";
```

Then in the `DashboardLayout` return, add the floating button right before the closing `</div>`:
```tsx
      <QuickAddTodo />
    </div>
  );
```

The full return block should end like:
```tsx
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="pl-60 print:pl-0">
        <div className="max-w-7xl mx-auto px-6 py-6 print:p-0 print:max-w-full">{children}</div>
      </main>
      <QuickAddTodo />
    </div>
  );
```

**Step 4: Commit**

```bash
git add "frontend/src/app/(dashboard)/layout.tsx"
git commit -m "feat: add todos nav item and floating quick-add button"
```

---

## Task 9: Deploy

**Step 1: Push backend**

```bash
git push origin master
# Render auto-deploys on push to master
# Monitor: https://cmt-backend-5xuu.onrender.com/docs — verify /todos endpoints appear
```

**Step 2: Push frontend**

Vercel auto-deploys on push. Monitor at Vercel dashboard.

**Step 3: Smoke test**

1. Open https://cmt-stitching-asadullah-shafiques-projects.vercel.app
2. Login → should see "Todos" in sidebar
3. Click floating "+" button → quick-add card appears with 3 fields
4. Create a todo → appears in Pending column
5. Click the circle → moves to Completed, if recurring → new one spawns
6. Open `/todos` page → filter bar works, kanban columns render correctly

---

## Summary

| Task | File(s) | Status |
|------|---------|--------|
| 1. Model | `backend/app/models/todos.py` | - |
| 2. Migration | `backend/alembic/versions/n4i5j6k7l8m9_add_todos_table.py` | - |
| 3. Schemas | `backend/app/schemas/todos.py` | - |
| 4. Endpoint | `backend/app/api/v1/endpoints/todos.py` | - |
| 5. Router | `backend/app/api/v1/router.py` | - |
| 6. Types + Services | `frontend/src/hooks/types.ts`, `services.ts`, `services.tsx` | - |
| 7. Todos Page | `frontend/src/app/(dashboard)/todos/page.tsx` | - |
| 8. Nav + Float Btn | `frontend/src/app/(dashboard)/layout.tsx` | - |
| 9. Deploy | push → Render + Vercel | - |
