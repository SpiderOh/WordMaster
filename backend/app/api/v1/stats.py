from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.stats import RepeatedForgettingWordRead, TodayStatsRead
from app.services.stats_service import StatsService

router = APIRouter(tags=["stats"])


def _selected_date(value: date | None) -> date:
    return value or datetime.now(timezone.utc).date()


@router.get("/today", response_model=TodayStatsRead)
def get_today_stats(
    selected_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TodayStatsRead:
    stats = StatsService(db).today(user_id=current_user.id, today=_selected_date(selected_date))
    return TodayStatsRead.model_validate(stats)


@router.get("/today/repeated-forgetting", response_model=list[RepeatedForgettingWordRead])
def get_repeated_forgetting_words(
    selected_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RepeatedForgettingWordRead]:
    stats = StatsService(db).today(user_id=current_user.id, today=_selected_date(selected_date))
    return [RepeatedForgettingWordRead.model_validate(item) for item in stats.repeated_forgetting_words]
