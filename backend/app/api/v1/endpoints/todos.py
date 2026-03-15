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
