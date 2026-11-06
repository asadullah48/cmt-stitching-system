"""Public statement boundaries, using synthetic parties and in-memory SQLite only."""
from datetime import date
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.share_links import create_share_link, router
from app.core.database import get_db
from app.models import Base, FinancialTransaction, Party, User
from app.models.share_link import ShareLink
from app.schemas.share_link import ShareLinkCreate


@pytest.fixture()
def public_statement():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__, Party.__table__, FinancialTransaction.__table__, ShareLink.__table__])
    with sessionmaker(bind=engine)() as db:
        owner = User(username="synthetic", email="owner@example.test", password_hash="not-a-real-password", role="admin")
        party = Party(name="SYNTHETIC Shared Party", email="private@example.test", phone="000", address="Private fixture address")
        other = Party(name="SYNTHETIC Other Party")
        db.add_all([owner, party, other])
        db.flush()
        for party_id, day, amount, description in [
            (party.id, date(2026, 10, 1), 100, "SYNTHETIC first bill"),
            (party.id, date(2026, 10, 31), 200, "SYNTHETIC second bill"),
            (party.id, date(2026, 9, 30), 999, "OUTSIDE DATE RANGE"),
            (other.id, date(2026, 10, 1), 999, "OTHER PARTY PRIVATE"),
        ]:
            db.add(FinancialTransaction(party_id=party_id, transaction_date=day, transaction_type="income", amount=amount, description=description))
        db.add(FinancialTransaction(party_id=party.id, transaction_date=date(2026, 10, 10), transaction_type="income", amount=999, description="DELETED PRIVATE", is_deleted=True))
        db.commit()
        link = create_share_link(ShareLinkCreate(party_id=party.id, date_from=date(2026, 10, 1), date_to=date(2026, 10, 31)), db, owner)
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield client, db, link
    engine.dispose()


def test_anonymous_statement_is_limited_to_public_fields_and_party_date_range(public_statement):
    client, _, link = public_statement
    response = client.get(f"/api/v1/public/statement/{link.token}")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"party_name", "date_from", "date_to", "transactions", "total_debit", "total_credit", "outstanding_balance"}
    assert body["party_name"] == "SYNTHETIC Shared Party"
    assert [row["description"] for row in body["transactions"]] == ["SYNTHETIC first bill", "SYNTHETIC second bill"]
    assert body["total_debit"] == body["outstanding_balance"] == 300
    assert body["total_credit"] == 0
    for row in body["transactions"]:
        assert set(row) == {"transaction_date", "transaction_type", "description", "reference_number", "payment_method", "debit", "credit", "running_balance"}
    assert "private@example.test" not in response.text
    assert "Private fixture address" not in response.text


@pytest.mark.parametrize("token,status", [(str(uuid4()), 404), ("not-a-uuid", 422)])
def test_unknown_or_malformed_token_is_rejected(public_statement, token, status):
    client, _, _ = public_statement
    assert client.get(f"/api/v1/public/statement/{token}").status_code == status


def test_revoked_link_no_longer_exposes_statement(public_statement):
    client, db, link = public_statement
    stored = db.query(ShareLink).filter(ShareLink.id == link.id).one()
    stored.is_revoked = True
    db.commit()
    response = client.get(f"/api/v1/public/statement/{link.token}")
    assert response.status_code == 404
    assert "SYNTHETIC Shared Party" not in response.text


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_public_statement_has_no_write_operations(public_statement, method):
    client, _, link = public_statement
    assert client.request(method, f"/api/v1/public/statement/{link.token}", json={}).status_code == 405


@pytest.mark.parametrize("method,path", [("GET", "/share-links/"), ("POST", "/share-links/"), ("DELETE", f"/share-links/{uuid4()}")])
def test_share_management_requires_authentication(public_statement, method, path):
    client, _, _ = public_statement
    assert client.request(method, f"/api/v1{path}", json={}).status_code == 401
