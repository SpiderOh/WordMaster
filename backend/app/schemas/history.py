from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class CalendarDayRead(BaseModel):
    date: date
    has_study: bool
    is_recommended: bool
    completion_count: int

    model_config = ConfigDict(from_attributes=True)


class CalendarSummaryRead(BaseModel):
    month: str
    days: list[CalendarDayRead]

    model_config = ConfigDict(from_attributes=True)


class HistoryPageSummaryRead(BaseModel):
    page_id: int
    page_number: int
    session_id: int | None
    study_number: int
    completed_on_date: bool
    is_recommended: bool
    second_completed: bool
    third_completed: bool
    remaining_recommended_rounds: int

    model_config = ConfigDict(from_attributes=True)


class DateHistoryRead(BaseModel):
    date: date
    pages: list[HistoryPageSummaryRead]

    model_config = ConfigDict(from_attributes=True)


class HistoryPageSnapshotRead(BaseModel):
    session_id: int
    page_id: int
    completed_at: datetime
    snapshot: dict[str, Any]
    previous_session_id: int | None
    next_session_id: int | None

    model_config = ConfigDict(from_attributes=True)
