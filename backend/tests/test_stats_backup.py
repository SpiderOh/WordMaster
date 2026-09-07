import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, StudySession, Word, WordProgress, WordStudyEvent
from app.db.session import get_db
from app.main import create_app
from app.services.forgetting_service import ForgettingService
from app.services.stats_service import StatsService
from app.services.study_page_service import StudyPageService
from app.services.vocabulary_import import VocabularyImportService


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'wordmaster-stats.db'}",
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


def create_page(db_session, words: list[str]):
    csv_text = "word,meaning\n" + "\n".join(f"{word},{word} meaning" for word in words) + "\n"
    VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text), name="Deck", user_id=1, filename="deck.csv"
    )
    return StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=len(words))


def test_today_stats_include_forgotten_words_repeated_forgetting_and_streak(db_session):
    page = create_page(db_session, ["alpha", "beta"])
    study_service = StudyPageService(db_session)
    now = datetime.now(timezone.utc)
    study_service.complete_page(page_id=page.id, completed_at=now - timedelta(days=2))
    study_service.complete_page(page_id=page.id, completed_at=now - timedelta(days=1))
    session = study_service.complete_page(page_id=page.id, completed_at=now)
    alpha = db_session.scalar(select(Word).where(Word.word == "alpha"))
    forgetting_service = ForgettingService(db_session)
    forgetting_service.mark_forgotten(user_id=1, word_id=alpha.id, session_id=session.id)
    forgetting_service.mark_forgotten(user_id=1, word_id=alpha.id, session_id=session.id)

    stats = StatsService(db_session).today(user_id=1, today=now.date())

    assert stats.study_word_count == 2
    assert stats.forgetting_count == 2
    assert stats.repeated_forgetting_count == 1
    assert stats.streak_days == 3
    assert stats.total_study_count == 6
    assert [item.word for item in stats.repeated_forgetting_words] == ["alpha"]


def test_repeated_forgetting_includes_a_word_forgotten_before_today(db_session):
    page = create_page(db_session, ["alpha"])
    now = datetime.now(timezone.utc)
    session = StudyPageService(db_session).complete_page(page_id=page.id, completed_at=now)
    word = db_session.scalar(select(Word))
    service = ForgettingService(db_session)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)
    first_event = db_session.scalar(
        select(WordStudyEvent).where(WordStudyEvent.event_type == "mark_forgotten")
    )
    first_event.created_at = now - timedelta(days=1)
    db_session.commit()
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)

    stats = StatsService(db_session).today(user_id=1, today=now.date())

    assert stats.forgetting_count == 1
    assert stats.repeated_forgetting_count == 1
    assert stats.repeated_forgetting_words[0].forget_count_today == 1


def test_today_study_count_includes_special_page_remembered_outcome(db_session):
    page = create_page(db_session, ["alpha"])
    now = datetime.now(timezone.utc)
    original_session = StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=now - timedelta(days=1),
    )
    word = db_session.scalar(select(Word))
    service = ForgettingService(db_session)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=original_session.id)
    forgetting_event = db_session.scalar(
        select(WordStudyEvent).where(WordStudyEvent.event_type == "mark_forgotten")
    )
    forgetting_event.created_at = now - timedelta(days=1)
    db_session.commit()
    special_page = service.create_special_page(user_id=1, word_ids=[word.id])
    service.complete_special_page(
        user_id=1,
        page_id=special_page.id,
        outcomes={word.id: "remembered"},
        completed_at=now,
    )

    stats = StatsService(db_session).today(user_id=1, today=now.date())

    assert stats.study_word_count == 1


def test_settings_api_persists_preferences_and_vocabulary_priorities(client, db_session):
    page = create_page(db_session, ["alpha"])
    vocabulary_id = db_session.scalar(select(Word).where(Word.word == "alpha")).vocabulary_id

    default_response = client.get("/api/v1/settings")
    update_response = client.put(
        "/api/v1/settings",
        json={
            "page_size": 20,
            "intervals": [0, 2, 7],
            "theme": "dark",
            "font_size": "large",
            "vocabulary_priorities": {str(vocabulary_id): 3},
        },
    )
    persisted_response = client.get("/api/v1/settings")

    assert page.user_id == 1
    assert default_response.status_code == 200
    assert default_response.json()["page_size"] == 15
    assert default_response.json()["intervals"] == [0, 1, 4]
    assert update_response.status_code == 200
    assert persisted_response.json()["theme"] == "dark"
    assert persisted_response.json()["vocabulary_priorities"] == {str(vocabulary_id): 3}


def test_stats_api_returns_server_aggregates_and_repeated_forgetting_details(client, db_session):
    page = create_page(db_session, ["alpha"])
    now = datetime.now(timezone.utc)
    session = StudyPageService(db_session).complete_page(page_id=page.id, completed_at=now)
    word = db_session.scalar(select(Word))
    service = ForgettingService(db_session)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)

    stats_response = client.get("/api/v1/stats/today", params={"date": now.date().isoformat()})
    details_response = client.get(
        "/api/v1/stats/today/repeated-forgetting",
        params={"date": now.date().isoformat()},
    )

    assert stats_response.status_code == 200
    assert stats_response.json()["study_word_count"] == 1
    assert stats_response.json()["repeated_forgetting_count"] == 1
    assert details_response.status_code == 200
    assert details_response.json()[0]["word"] == "alpha"


def test_json_backup_restores_complete_progress_and_invalid_import_rolls_back(client, db_session):
    page = create_page(db_session, ["alpha", "beta"])
    session = StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )
    alpha = db_session.scalar(select(Word).where(Word.word == "alpha"))
    alpha_id = alpha.id
    ForgettingService(db_session).mark_forgotten(user_id=1, word_id=alpha.id, session_id=session.id)

    export_response = client.get("/api/v1/backup/json")
    assert export_response.status_code == 200
    backup = export_response.json()
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == alpha.id))
    progress.forget_count = 99
    db_session.commit()

    restore_response = client.post("/api/v1/backup/json", json=backup)
    restored_progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == alpha_id))
    invalid_backup = {**backup, "data": {**backup["data"], "words": []}}
    invalid_response = client.post("/api/v1/backup/json", json=invalid_backup)
    progress_after_invalid = db_session.scalar(select(WordProgress).where(WordProgress.word_id == alpha_id))

    assert backup["version"] == 1
    assert restore_response.status_code == 200
    assert restored_progress.forget_count == 1
    assert db_session.scalars(select(StudySession)).all()
    assert invalid_response.status_code == 400
    assert progress_after_invalid.forget_count == 1


def test_vocabulary_csv_export_preserves_source_fields(client, db_session):
    csv_text = 'number,word,meaning,source_page\n1,alpha,"中文释义\n第二行",12\n'
    result = VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text), name="Deck", user_id=1, filename="deck.csv"
    )

    response = client.get(f"/api/v1/vocabularies/{result.vocabulary.id}/export")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content.startswith(b"\xef\xbb\xbf")
    decoded = response.content.decode("utf-8-sig")
    assert "number,word,meaning,source_page" in response.text
    assert '1,alpha,"中文释义\n第二行",12' in decoded
