import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.session import get_db
from app.main import create_app
from app.services.history_service import HistoryService, calculate_recommended_dates
from app.services.study_page_service import StudyPageService
from app.services.vocabulary_import import VocabularyImportService


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'wordmaster-history.db'}",
        connect_args={"check_same_thread": False},
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with testing_session() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    app = create_app()

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app, raise_server_exceptions=False)


def create_page(db_session, words: list[str], page_size: int = 2):
    csv_text = "word,meaning\n" + "\n".join(f"{word},{word} meaning" for word in words) + "\n"
    VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text),
        name="Deck",
        user_id=1,
        filename="deck.csv",
    )
    return StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=page_size)


def test_calculate_recommended_dates_uses_completion_date_and_intervals():
    completed_at = datetime(2026, 9, 4, 23, 30, tzinfo=timezone.utc)

    dates = calculate_recommended_dates(completed_at, [0, 1, 4])

    assert [value.isoformat() for value in dates] == ["2026-09-04", "2026-09-05", "2026-09-08"]


def test_calendar_marks_study_recommendations_and_gray_days(db_session):
    page = create_page(db_session, ["alpha", "beta"])
    StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )

    calendar = HistoryService(db_session).calendar(user_id=1, month="2026-09", intervals=[0, 1, 4])

    by_date = {item.date.isoformat(): item for item in calendar.days}
    assert len(calendar.days) == 30
    assert by_date["2026-09-04"].has_study is True
    assert by_date["2026-09-04"].is_recommended is True
    assert by_date["2026-09-05"].has_study is False
    assert by_date["2026-09-05"].is_recommended is True
    assert by_date["2026-09-06"].has_study is False
    assert by_date["2026-09-06"].is_recommended is False


def test_date_history_reports_second_and_third_completion_status(db_session):
    page = create_page(db_session, ["alpha", "beta"])
    service = StudyPageService(db_session)
    service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc))
    second = service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 5, 8, tzinfo=timezone.utc))

    history = HistoryService(db_session).for_date(user_id=1, selected_date=second.completed_at.date(), intervals=[0, 1, 4])

    assert len(history.pages) == 1
    item = history.pages[0]
    assert item.page_id == page.id
    assert item.session_id == second.id
    assert item.study_number == 2
    assert item.completed_on_date is True
    assert item.is_recommended is True
    assert item.second_completed is True
    assert item.third_completed is False
    assert item.remaining_recommended_rounds == 1


def test_recommended_date_uses_the_interval_round_when_not_completed(db_session):
    page = create_page(db_session, ["alpha", "beta"])
    StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )

    history = HistoryService(db_session).for_date(
        user_id=1,
        selected_date=datetime(2026, 9, 8, tzinfo=timezone.utc).date(),
        intervals=[0, 1, 4],
    )

    item = history.pages[0]
    assert item.study_number == 3
    assert item.completed_on_date is False
    assert item.third_completed is False


def test_history_page_uses_immutable_snapshot_and_adjacent_sessions(db_session):
    first_page = create_page(db_session, ["alpha", "beta", "gamma", "delta"])
    service = StudyPageService(db_session)
    first_session = service.complete_page(
        page_id=first_page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )
    second_page = service.get_or_create_next_page(user_id=1, page_size=2)
    second_session = service.complete_page(
        page_id=second_page.id,
        completed_at=datetime(2026, 9, 4, 9, tzinfo=timezone.utc),
    )
    first_page.page_size = 15
    db_session.commit()

    first_history = HistoryService(db_session).page_snapshot(user_id=1, session_id=first_session.id)
    second_history = HistoryService(db_session).page_snapshot(user_id=1, session_id=second_session.id)

    assert first_history.snapshot["page_size"] == 2
    assert [item["word"] for item in first_history.snapshot["words"]] == ["alpha", "beta"]
    assert first_history.previous_session_id is None
    assert first_history.next_session_id == second_session.id
    assert second_history.previous_session_id == first_session.id
    assert second_history.next_session_id is None


def test_history_api_exposes_calendar_date_pages_and_snapshot(client, db_session):
    page = create_page(db_session, ["alpha", "beta"])
    session = StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )

    calendar_response = client.get("/api/v1/history/calendar", params={"month": "2026-09"})
    date_response = client.get("/api/v1/history", params={"date": "2026-09-04"})
    page_response = client.get(f"/api/v1/history/pages/{session.id}")

    assert calendar_response.status_code == 200
    assert len(calendar_response.json()["days"]) == 30
    assert date_response.status_code == 200
    assert date_response.json()["pages"][0]["study_number"] == 1
    assert page_response.status_code == 200
    assert page_response.json()["snapshot"]["words"][0]["word"] == "alpha"
