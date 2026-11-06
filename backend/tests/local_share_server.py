"""Disposable synthetic SQLite app for localhost HTTP validation. Never uses .env DB."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "synthetic-local-validation-key-not-for-deployment"

from contextlib import asynccontextmanager
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def sqlite_jsonb(_type, compiler, **kw):
    # Test-only storage compatibility; application models remain unchanged.
    return "JSON"


from app.core import database

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
database.engine = engine
database.SessionLocal = sessionmaker(bind=engine)

from app.main import app
from app.models import Base, Party
from app.models.share_link import ShareLink
from app.schemas.bill import BillCreate
from app.services.auth_service import AuthService
from app.services.bill_service import BillService


@asynccontextmanager
async def synthetic_lifespan(_app):
    # The production migration/seeding lifespan is deliberately not run.
    Base.metadata.create_all(engine)
    with database.SessionLocal() as db:
        user = AuthService.create_user(db, "qaadmin", "qaadmin@example.test", "qaadmin123", "admin")
        party = Party(name="SYNTHETIC Share Party", email="private@example.test", phone="000", address="Private synthetic address")
        db.add(party)
        db.commit()
        BillService.create(db, BillCreate(party_id=party.id, bill_date=date(2026, 10, 31), amount_due=1250, description="SYNTHETIC bill for share validation"), user.id)
        db.add(ShareLink(token=UUID("abcdefab-1111-4111-8111-111111111111"), party_id=party.id, date_from=date(2026, 10, 1), date_to=date(2026, 10, 31), created_by=user.id))
        db.commit()
    print("SYNTHETIC ONLY: DATABASE_URL scheme=sqlite host=sqlite; HTTP host=127.0.0.1", flush=True)
    yield
    engine.dispose()


app.router.lifespan_context = synthetic_lifespan

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8100)
