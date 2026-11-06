from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.inventory import InventoryItem
from app.models.orders import Order
from app.models.overhead import OverheadExpense
from app.models.todos import Todo
from app.schemas.reports import DailyReport, DailyStage, DailyTodo


class ReportService:
    IN_PROGRESS_STAGES = (
        "cutting_in_progress",
        "stitching_in_progress",
        "packing_in_progress",
    )

    @staticmethod
    def get_daily(db: Session, report_date: date) -> DailyReport:
        active_orders = Order.is_deleted.is_(False)
        dispatched = db.query(Order).filter(
            active_orders,
            Order.status == "dispatched",
            Order.dispatch_date == report_date,
        ).order_by(Order.order_number).all()
        ready = db.query(Order).filter(
            active_orders,
            Order.status == "packing_complete",
        ).order_by(Order.order_number).all()

        progress_orders = db.query(Order).filter(
            active_orders,
            Order.status.in_(ReportService.IN_PROGRESS_STAGES),
        ).order_by(Order.order_number).all()
        by_stage = {stage: [] for stage in ReportService.IN_PROGRESS_STAGES}
        for order in progress_orders:
            by_stage[order.status].append(order)
        stages = [
            DailyStage(
                stage=stage,
                orders=orders,
                total_quantity=sum(order.total_quantity for order in orders),
            )
            for stage, orders in by_stage.items()
        ]

        todos = db.query(Todo).options(joinedload(Todo.order)).filter(
            Todo.is_deleted.is_(False),
            Todo.order_id.is_not(None),
            Todo.status.in_(("pending", "in_progress")),
        ).order_by(Todo.due_date.asc().nullslast(), Todo.created_at).all()
        todo_rows = [
            DailyTodo(
                id=todo.id,
                title=todo.title,
                priority=todo.priority,
                due_date=todo.due_date,
                order_id=todo.order_id,
                order_number=todo.order.order_number,
            )
            for todo in todos
            if todo.order and not todo.order.is_deleted
        ]

        low_stock = db.query(InventoryItem).filter(
            InventoryItem.is_deleted.is_(False),
            func.coalesce(InventoryItem.current_stock, 0)
            <= func.coalesce(InventoryItem.minimum_stock, 0),
        ).order_by(InventoryItem.name).all()

        due_through = report_date + timedelta(days=7)
        dues = db.query(OverheadExpense).filter(
            OverheadExpense.is_deleted.is_(False),
            OverheadExpense.status == "unpaid",
            OverheadExpense.due_date >= report_date,
            OverheadExpense.due_date <= due_through,
        ).order_by(OverheadExpense.due_date, OverheadExpense.title).all()

        return DailyReport(
            date=report_date,
            orders_dispatched=dispatched,
            ready_for_dispatch=ready,
            in_progress=stages,
            open_order_todos=todo_rows,
            low_stock_items=low_stock,
            overhead_due=dues,
            overhead_due_total=sum((due.amount for due in dues), Decimal("0")),
        )

