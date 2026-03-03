from fastapi import APIRouter

from app.core.deps import CurrentUser, DbDep
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: DbDep, _: CurrentUser):
    return DashboardService.get_summary(db)
