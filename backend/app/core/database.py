from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .config import settings

# Normalise URL to psycopg2 (system env may contain an asyncpg URL)
_db_url = (
    settings.DATABASE_URL
    .replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    .replace("?ssl=require", "?sslmode=require")
)

engine = create_engine(_db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
