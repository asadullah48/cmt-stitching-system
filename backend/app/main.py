import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic migrations applied successfully")
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")


def seed_admin() -> None:
    """Create the default admin user if no users exist in the database."""
    try:
        from app.core.database import SessionLocal
        from app.models.users import User
        from app.services.auth_service import AuthService
        db = SessionLocal()
        try:
            count = db.query(User).filter(User.is_deleted.is_(False)).count()
            if count == 0:
                AuthService.create_user(
                    db=db,
                    username=settings.ADMIN_USERNAME,
                    email=settings.ADMIN_EMAIL,
                    password=settings.ADMIN_PASSWORD,
                    role="admin",
                )
                logger.info(f"Default admin user '{settings.ADMIN_USERNAME}' created")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Admin seed error (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    seed_admin()
    yield


app = FastAPI(
    title="CMT Stitching & Packing Management System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    origin = request.headers.get("origin", "")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {str(exc)}"},
        headers=headers,
    )

# allow_origin_regex covers all Vercel preview/prod URLs regardless of Render env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {"message": "CMT Stitching & Packing Management System API", "docs": "/docs"}
