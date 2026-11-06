from datetime import date

from fastapi import APIRouter, Query, Response

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



@router.get("/daily/piecework.csv")
def daily_piecework_csv(db: DbDep, _: CurrentUser, report_date: date = Query(alias="date")):
    return Response(
        ReportService.get_daily_piecework_csv(db, report_date),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="piecework-{report_date}.csv"'},
    )
