from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import StudyPage, StudySession


@dataclass(frozen=True)
class CalendarDay:
    date: date
    has_study: bool
    is_recommended: bool
    completion_count: int


@dataclass(frozen=True)
class CalendarSummary:
    month: str
    days: list[CalendarDay]


@dataclass(frozen=True)
class HistoryPageSummary:
    page_id: int
    page_number: int
    session_id: int | None
    study_number: int
    completed_on_date: bool
    is_recommended: bool
    second_completed: bool
    third_completed: bool
    remaining_recommended_rounds: int


@dataclass(frozen=True)
class DateHistory:
    date: date
    pages: list[HistoryPageSummary]


@dataclass(frozen=True)
class HistoryPageSnapshot:
    session_id: int
    page_id: int
    completed_at: datetime
    snapshot: dict[str, Any]
    previous_session_id: int | None
    next_session_id: int | None


class HistoryNotFoundError(ValueError):
    pass


def calculate_recommended_dates(completed_at: datetime, intervals: list[int]) -> list[date]:
    return list(dict.fromkeys(completed_at.date() + timedelta(days=interval) for interval in intervals))


class HistoryService:
    def __init__(self, db: Session):
        self.db = db

    def calendar(self, user_id: int, month: str, intervals: list[int]) -> CalendarSummary:
        month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
        day_count = monthrange(month_start.year, month_start.month)[1]
        sessions = list(
            self.db.scalars(
                select(StudySession)
                .where(StudySession.user_id == user_id, StudySession.undone_at.is_(None))
                .order_by(StudySession.completed_at, StudySession.id)
            )
        )
        completion_counts: dict[date, int] = {}
        first_by_page: dict[int, datetime] = {}
        for session in sessions:
            completion_date = session.completed_at.date()
            completion_counts[completion_date] = completion_counts.get(completion_date, 0) + 1
            first_by_page.setdefault(session.page_id, session.completed_at)

        recommended_dates = {
            recommended
            for completed_at in first_by_page.values()
            for recommended in calculate_recommended_dates(completed_at, intervals)
        }
        days = [
            CalendarDay(
                date=month_start + timedelta(days=offset),
                has_study=(month_start + timedelta(days=offset)) in completion_counts,
                is_recommended=(month_start + timedelta(days=offset)) in recommended_dates,
                completion_count=completion_counts.get(month_start + timedelta(days=offset), 0),
            )
            for offset in range(day_count)
        ]
        return CalendarSummary(month=month, days=days)

    def for_date(self, user_id: int, selected_date: date, intervals: list[int]) -> DateHistory:
        sessions = list(
            self.db.scalars(
                select(StudySession)
                .where(StudySession.user_id == user_id, StudySession.undone_at.is_(None))
                .order_by(StudySession.completed_at, StudySession.id)
            )
        )
        sessions_by_page: dict[int, list[StudySession]] = {}
        for session in sessions:
            sessions_by_page.setdefault(session.page_id, []).append(session)

        configured_rounds = len(dict.fromkeys(intervals))
        pages: list[HistoryPageSummary] = []
        for page_id, page_sessions in sessions_by_page.items():
            recommended_dates = calculate_recommended_dates(page_sessions[0].completed_at, intervals)
            sessions_through_date = [session for session in page_sessions if session.completed_at.date() <= selected_date]
            sessions_on_date = [session for session in page_sessions if session.completed_at.date() == selected_date]
            is_recommended = selected_date in recommended_dates
            if not sessions_on_date and not is_recommended:
                continue

            page = self.db.get(StudyPage, page_id)
            completed_rounds = len(sessions_through_date)
            pages.append(
                HistoryPageSummary(
                    page_id=page_id,
                    page_number=page.page_number,
                    session_id=sessions_on_date[-1].id if sessions_on_date else None,
                    study_number=(page_sessions.index(sessions_on_date[-1]) + 1)
                    if sessions_on_date
                    else recommended_dates.index(selected_date) + 1,
                    completed_on_date=bool(sessions_on_date),
                    is_recommended=is_recommended,
                    second_completed=completed_rounds >= 2,
                    third_completed=completed_rounds >= 3,
                    remaining_recommended_rounds=max(0, configured_rounds - completed_rounds),
                )
            )
        pages.sort(key=lambda item: (item.page_number, item.page_id))
        return DateHistory(date=selected_date, pages=pages)

    def page_snapshot(self, user_id: int, session_id: int) -> HistoryPageSnapshot:
        sessions = list(
            self.db.scalars(
                select(StudySession)
                .where(StudySession.user_id == user_id, StudySession.undone_at.is_(None))
                .order_by(StudySession.completed_at, StudySession.id)
            )
        )
        matching_indexes = [index for index, session in enumerate(sessions) if session.id == session_id]
        if not matching_indexes:
            raise HistoryNotFoundError("History session not found")
        index = matching_indexes[0]
        session = sessions[index]
        return HistoryPageSnapshot(
            session_id=session.id,
            page_id=session.page_id,
            completed_at=session.completed_at,
            snapshot=session.snapshot,
            previous_session_id=sessions[index - 1].id if index > 0 else None,
            next_session_id=sessions[index + 1].id if index + 1 < len(sessions) else None,
        )
