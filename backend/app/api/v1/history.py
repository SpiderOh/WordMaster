from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.history import CalendarSummaryRead, DateHistoryRead, HistoryPageSnapshotRead
from app.services.history_service import HistoryNotFoundError, HistoryService

router = APIRouter(tags=["history"])
DEFAULT_INTERVALS = [0, 1, 4]


@router.get("/calendar", response_model=CalendarSummaryRead)
def get_calendar(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CalendarSummaryRead:
    return CalendarSummaryRead.model_validate(
        HistoryService(db).calendar(user_id=current_user.id, month=month, intervals=DEFAULT_INTERVALS)
    )


@router.get("", response_model=DateHistoryRead)
def get_history_for_date(
    selected_date: date = Query(alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DateHistoryRead:
    return DateHistoryRead.model_validate(
        HistoryService(db).for_date(user_id=current_user.id, selected_date=selected_date, intervals=DEFAULT_INTERVALS)
    )


@router.get("/pages/{session_id}", response_model=HistoryPageSnapshotRead)
def get_history_page(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HistoryPageSnapshotRead:
    try:
        snapshot = HistoryService(db).page_snapshot(user_id=current_user.id, session_id=session_id)
    except HistoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return HistoryPageSnapshotRead.model_validate(snapshot)
