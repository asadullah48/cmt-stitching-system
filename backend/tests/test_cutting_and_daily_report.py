from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.reports import router as reports_router
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Base
from app.models.inventory import InventoryCategory, InventoryItem
from app.models.orders import Order, OrderItem
from app.models.overhead import OverheadExpense
from app.models.parties import Party
from app.models.products import Product
from app.models.todos import Todo
from app.models.users import User
from app.schemas.orders import OrderItemOut, OrderOut, OrderStatus, OrderStatusUpdate
from app.schemas.production import Department, ProductionSessionCreate


def test_cutting_statuses_are_accepted():
    assert OrderStatusUpdate(status="cutting_in_progress").status is OrderStatus.cutting_in_progress
    assert OrderStatusUpdate(status="cutting_complete").status is OrderStatus.cutting_complete


def test_cutting_session_is_accepted():
    payload = ProductionSessionCreate(
        order_id=uuid4(),
        department="cutting",
        session_date=date(2026, 10, 22),
        machines_used=2,
    )
    assert payload.department is Department.cutting


def test_over_cut_warning_uses_item_cut_quantities():
    order = OrderOut(
        id=uuid4(),
        order_number="ORD-TEST-1",
        goods_description="Two colours",
        total_quantity=600,
        stitch_rate_party=Decimal("1"),
        stitch_rate_labor=Decimal("1"),
        status="cutting_in_progress",
        entry_date=date(2026, 10, 22),
        items=[
            OrderItemOut(id=uuid4(), size="Navy", quantity=300, cut_quantity=328, completed_quantity=0, packed_quantity=0),
            OrderItemOut(id=uuid4(), size="Grey", quantity=300, cut_quantity=432, completed_quantity=0, packed_quantity=0),
        ],
    )
    assert order.cut_quantity_total == 760
    assert order.over_cut_warning is True


@pytest.fixture()
def report_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[
        User.__table__,
        Party.__table__,
        InventoryCategory.__table__,
        InventoryItem.__table__,
        Product.__table__,
        Order.__table__,
        OrderItem.__table__,
        Todo.__table__,
        OverheadExpense.__table__,
    ])
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()
    user = User(username="tester", email="tester@example.com", password_hash="x", role="admin")
    db.add(user)
    db.commit()
    db.refresh(user)

    app = FastAPI()
    app.include_router(reports_router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    with TestClient(app) as client:
        yield client, db
    db.close()


def _order(number: str, status: str, report_date: date) -> Order:
    return Order(
        order_number=number,
        goods_description="Test goods",
        total_quantity=100,
        stitch_rate_party=Decimal("10"),
        stitch_rate_labor=Decimal("5"),
        status=status,
        entry_date=report_date,
        dispatch_date=report_date if status == "dispatched" else None,
    )


def test_daily_report_endpoint_lists_dispatched_low_stock_and_dues_total(report_client):
    client, db = report_client
    report_date = date(2026, 10, 22)
    dispatched = _order("ORD-DISPATCHED", "dispatched", report_date)
    ready = _order("ORD-READY", "packing_complete", report_date)
    cutting = _order("ORD-CUTTING", "cutting_in_progress", report_date)
    db.add_all([dispatched, ready, cutting])
    db.flush()
    db.add(OrderItem(order_id=cutting.id, size="Navy", quantity=100, cut_quantity=110))
    db.add(InventoryItem(name="Thread", unit="cones", current_stock=Decimal("4"), minimum_stock=Decimal("5")))
    db.add_all([
        OverheadExpense(title="Rent", category="rent", amount=Decimal("15000"), due_date=report_date + timedelta(days=2), status="unpaid"),
        OverheadExpense(title="Electricity", category="utilities", amount=Decimal("5000"), due_date=report_date + timedelta(days=7), status="unpaid"),
        OverheadExpense(title="Later", category="other", amount=Decimal("999"), due_date=report_date + timedelta(days=8), status="unpaid"),
    ])
    db.commit()

    response = client.get("/api/v1/reports/daily", params={"date": report_date.isoformat()})

    assert response.status_code == 200
    body = response.json()
    assert [row["order_number"] for row in body["orders_dispatched"]] == ["ORD-DISPATCHED"]
    assert [row["order_number"] for row in body["ready_for_dispatch"]] == ["ORD-READY"]
    assert [row["name"] for row in body["low_stock_items"]] == ["Thread"]
    assert Decimal(body["overhead_due_total"]) == Decimal("20000")
    cutting_stage = next(stage for stage in body["in_progress"] if stage["stage"] == "cutting_in_progress")
    assert cutting_stage["total_quantity"] == 100
