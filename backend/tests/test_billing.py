"""Exercise real billing services with mocked SQLAlchemy sessions, without a DB."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.bill import Bill
from app.models.financial import FinancialTransaction
from app.schemas.bill import BillCreate
from app.services import auto_bill_service as auto
from app.services.bill_service import BillService

DAY = date(2026, 10, 16)


def query(result=None, count=0):
    q = MagicMock()
    for method in ("filter", "options", "order_by", "with_for_update"):
        getattr(q, method).return_value = q
    q.first.return_value = result
    q.count.return_value = count
    q.all.return_value = []
    return q


def order(status="packing_complete"):
    return SimpleNamespace(
        id=uuid4(), party_id=uuid4(), status=status,
        dispatch_date=None, actual_completion=None, carrier=None,
        tracking_number=None, carton_count=None, total_weight=None,
        goods_description="Demo data: shirts", total_quantity=10,
        order_number="DEMO-ORDER",
    )


@pytest.fixture
def collaborators(monkeypatch):
    for name in ("log_create", "log_delete"):
        monkeypatch.setattr("app.services.bill_service.AuditService." + name, MagicMock())
    monkeypatch.setattr("app.services.bill_service.AllocationService.reconcile", MagicMock())


@pytest.mark.parametrize("series,ledger_type", [("A", "income"), ("B", "accessories"), ("C", "packing")])
def test_series_creation_posts_correct_ledger(series, ledger_type, collaborators):
    db = MagicMock()
    item = order()
    party = SimpleNamespace(balance=Decimal("25"))
    db.query.side_effect = [query(item), query(), query(party), query(party), query()]
    bill = BillService.create(db, BillCreate(order_id=item.id, bill_series=series,
                              bill_date=DAY, amount_due=Decimal("100")), uuid4())
    assert (bill.bill_series, bill.bill_number, bill.bill_sequence) == (series, series + "01", 1)
    assert bill.amount_due == Decimal("100")
    entries = [call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], FinancialTransaction)]
    assert len(entries) == 1
    assert (entries[0].transaction_type, entries[0].amount) == (ledger_type, Decimal("100"))
    assert party.balance == Decimal("125")
    assert item.status == "dispatched"
    assert item.dispatch_date == DAY


def test_second_bill_preserves_dispatch_dates(collaborators):
    db = MagicMock()
    item = order("dispatched")
    original = date(2026, 10, 1)
    item.dispatch_date = item.actual_completion = original
    party = SimpleNamespace(balance=Decimal("0"))
    db.query.side_effect = [query(item), query(), query(party), query(party)]
    BillService.create(db, BillCreate(order_id=item.id, bill_series="C",
                       bill_date=DAY, amount_due=Decimal("100")), uuid4())
    assert item.status == "dispatched"
    assert item.dispatch_date == item.actual_completion == original


@pytest.mark.parametrize("other_active_bills", [0, 1])
def test_delete_reverts_only_last_active_bill(other_active_bills, collaborators):
    db = MagicMock()
    item = order("dispatched")
    item.dispatch_date = item.actual_completion = DAY
    bill = SimpleNamespace(id=uuid4(), order_id=item.id, order=item, party_id=None,
                           bill_date=DAY, is_deleted=False)
    db.query.side_effect = [query(bill), query(), query(count=other_active_bills)]
    BillService.delete(db, bill.id, uuid4())
    assert bill.is_deleted
    assert item.status == ("packing_complete" if not other_active_bills else "dispatched")
    assert item.dispatch_date == (None if not other_active_bills else DAY)
    assert item.actual_completion == (None if not other_active_bills else DAY)


@pytest.mark.parametrize("customer_rate", [Decimal("5"), Decimal("0")])
def test_auto_bill_retry_does_not_duplicate_bills_or_costs(monkeypatch, customer_rate):
    db = MagicMock()
    item = order()
    labour = SimpleNamespace(id=uuid4(), balance=Decimal("0"))
    vendor = SimpleNamespace(id=uuid4(), balance=Decimal("0"))
    template = SimpleNamespace(bill_series="A", customer_rate=customer_rate,
                              labour_rate=Decimal("2"), vendor_rate=Decimal("3"),
                              description="Demo data: stitching")
    monkeypatch.setattr(auto, "_matching_templates", lambda *_: [template])
    monkeypatch.setattr(auto, "_get_internal_party", lambda db, kind: labour if kind == "labour" else vendor)
    series = set()
    monkeypatch.setattr(auto, "_existing_series", lambda *_: set(series))
    bills = []
    def create(db, data, user_id):
        bill = Bill(bill_series=data.bill_series, amount_due=data.amount_due)
        series.add(data.bill_series)
        bills.append(bill)
        return bill
    monkeypatch.setattr(BillService, "create", create)
    # Query results reflect previously posted cost rows on a sequential retry.
    posted = []
    db.add.side_effect = posted.append
    def cost_query(*entities):
        q = query()
        def filtered(*criteria):
            from sqlalchemy.dialects import postgresql
            params = {}
            for criterion in criteria:
                params.update(criterion.compile(dialect=postgresql.dialect()).params)
            q.first.return_value = next((row for row in posted if all(
                getattr(row, key.rsplit("_", 1)[0], None) == value
                for key, value in params.items()
            )), None)
            return q
        q.filter.side_effect = filtered
        return q
    db.query.side_effect = cost_query
    first = auto.auto_generate_bills(db, item, uuid4(), DAY)
    second = auto.auto_generate_bills(db, item, uuid4(), DAY)
    assert len(first) == (1 if customer_rate else 0)
    assert second == []
    assert len(bills) == (1 if customer_rate else 0)
    assert len(posted) == 2
    assert labour.balance == Decimal("20")
    assert vendor.balance == Decimal("30")
