from datetime import date

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbDep
from app.schemas.reports import DailyReport
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/daily", response_model=DailyReport)
def daily_report(
    db: DbDep,
    current_user: CurrentUser,
    report_date: date = Query(alias="date"),
):
    return ReportService.get_daily(db, report_date)

