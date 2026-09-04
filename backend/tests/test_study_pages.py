import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import (
    Base,
    OperationLog,
    StudyPage,
    StudyPageWord,
    StudySession,
    Vocabulary,
    Word,
    WordProgress,
    WordStudyEvent,
)
from app.db.session import get_db
from app.main import create_app
from app.services.study_page_service import NoEligibleWordsError, StudyPageService
from app.services.vocabulary_import import VocabularyImportService


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'wordmaster-study.db'}",
        connect_args={"check_same_thread": False},
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSession() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    app = create_app()

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app, raise_server_exceptions=False)


def import_words(db_session, name: str, words: list[str]) -> Vocabulary:
    csv_text = "word,meaning\n" + "\n".join(f"{word},{word} meaning" for word in words) + "\n"
    result = VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text),
        name=name,
        user_id=1,
        filename=f"{name}.csv",
    )
    return result.vocabulary


def active_words(db_session, page: StudyPage) -> list[Word]:
    return list(
        db_session.scalars(
            select(Word)
            .join(StudyPageWord)
            .where(StudyPageWord.page_id == page.id, StudyPageWord.active.is_(True))
            .order_by(StudyPageWord.display_order)
        )
    )


def test_next_page_uses_vocabulary_priority_and_csv_order(db_session):
    first = import_words(db_session, "First", ["alpha", "beta"])
    second = import_words(db_session, "Second", ["gamma", "delta"])
    first.priority = 20
    second.priority = 5
    db_session.commit()

    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=4)

    assert [word.word for word in active_words(db_session, page)] == ["gamma", "delta", "alpha", "beta"]
    assert page.page_size == 4
    assert page.status == "in_progress"


def test_next_page_skips_cross_vocabulary_words_mastered_elsewhere_without_forgetting(db_session):
    first = import_words(db_session, "First", ["alpha"])
    second = import_words(db_session, "Second", ["alpha", "gamma"])
    first.priority = 1
    second.priority = 0
    mastered_word = db_session.scalar(select(Word).where(Word.vocabulary_id == first.id))
    mastered_progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == mastered_word.id))
    mastered_progress.study_count = 3
    mastered_progress.has_forgotten = False
    db_session.commit()

    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=2)

    assert [word.word for word in active_words(db_session, page)] == ["gamma"]
    assert page.is_short is True


def test_cross_vocabulary_word_is_not_skipped_when_it_was_forgotten(db_session):
    first = import_words(db_session, "First", ["alpha"])
    second = import_words(db_session, "Second", ["alpha", "gamma"])
    first.priority = 1
    second.priority = 0
    remembered_word = db_session.scalar(select(Word).where(Word.vocabulary_id == first.id))
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == remembered_word.id))
    progress.study_count = 3
    progress.has_forgotten = True
    db_session.commit()

    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=2)

    assert [word.word for word in active_words(db_session, page)] == ["alpha", "gamma"]
    assert page.is_short is False


def test_unfinished_page_is_reused_even_when_new_page_size_changes(db_session):
    import_words(db_session, "Small", ["alpha", "beta"])
    service = StudyPageService(db_session)

    page = service.get_or_create_next_page(user_id=1, page_size=2)
    reused = service.get_or_create_next_page(user_id=1, page_size=15)

    assert reused.id == page.id
    assert reused.page_size == 2


def test_next_page_does_not_persist_an_empty_page(db_session):
    service = StudyPageService(db_session)

    with pytest.raises(NoEligibleWordsError, match="No eligible words available"):
        service.get_or_create_next_page(user_id=1, page_size=15)

    assert db_session.scalars(select(StudyPage)).all() == []


def test_replace_mastered_word_removes_word_and_adds_zero_count_replacement(db_session):
    import_words(db_session, "Deck", ["alpha", "beta", "gamma"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    old_word = active_words(db_session, page)[0]

    updated = service.replace_mastered_word(page_id=page.id, word_id=old_word.id)

    old_progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == old_word.id))
    current_words = active_words(db_session, updated)
    replacement = current_words[-1]
    replacement_progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == replacement.id))
    inactive_link = db_session.scalar(
        select(StudyPageWord).where(StudyPageWord.page_id == page.id, StudyPageWord.word_id == old_word.id)
    )
    assert old_progress.status == "mastered"
    assert inactive_link.active is False
    assert [word.word for word in current_words] == ["beta", "gamma"]
    assert replacement_progress.study_count == 0


def test_replace_mastered_word_marks_page_short_when_no_replacement_exists(db_session):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    old_word = active_words(db_session, page)[0]

    updated = service.replace_mastered_word(page_id=page.id, word_id=old_word.id)

    assert [word.word for word in active_words(db_session, updated)] == ["beta"]
    assert updated.is_short is True


def test_replace_mastered_word_rolls_back_all_changes_on_failure(db_session, monkeypatch):
    import_words(db_session, "Deck", ["alpha", "beta", "gamma"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    old_word = active_words(db_session, page)[0]

    def fail_before_commit(*args, **kwargs):
        raise RuntimeError("simulated audit failure")

    monkeypatch.setattr("app.services.study_page_service.log_operation", fail_before_commit)
    with pytest.raises(RuntimeError, match="simulated audit failure"):
        service.replace_mastered_word(page_id=page.id, word_id=old_word.id)

    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == old_word.id))
    link = db_session.scalar(
        select(StudyPageWord).where(StudyPageWord.page_id == page.id, StudyPageWord.word_id == old_word.id)
    )
    assert progress.status == "unlearned"
    assert link.active is True
    assert db_session.scalars(select(WordStudyEvent)).all() == []
    assert db_session.scalars(select(OperationLog).where(OperationLog.operation == "word_mark_mastered")).all() == []


def test_complete_page_increments_words_and_writes_snapshot_events(db_session):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    completed_at = datetime(2026, 9, 4, 8, 30, tzinfo=timezone.utc)

    session = service.complete_page(page_id=page.id, completed_at=completed_at)

    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    events = db_session.scalars(select(WordStudyEvent).order_by(WordStudyEvent.id)).all()
    assert session.completed_at == completed_at
    assert session.snapshot["words"][0]["word"] == "alpha"
    assert session.snapshot["words"][1]["study_count_before"] == 0
    assert [progress.study_count for progress in progress_rows] == [1, 1]
    assert {progress.status for progress in progress_rows} == {"learning"}
    assert [event.event_type for event in events] == ["study_completed", "study_completed"]


def test_complete_page_rolls_back_all_changes_on_failure(db_session, monkeypatch):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)

    def fail_before_commit(*args, **kwargs):
        raise RuntimeError("simulated audit failure")

    monkeypatch.setattr("app.services.study_page_service.log_operation", fail_before_commit)
    with pytest.raises(RuntimeError, match="simulated audit failure"):
        service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc))

    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    db_session.refresh(page)
    assert [progress.study_count for progress in progress_rows] == [0, 0]
    assert page.status == "in_progress"
    assert page.completed_at is None
    assert db_session.scalars(select(StudySession)).all() == []
    assert db_session.scalars(select(WordStudyEvent)).all() == []


def test_undo_last_completion_reverts_counts_and_adds_events(db_session):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    session = service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 4, tzinfo=timezone.utc))

    service.undo_completion(session_id=session.id, now=session.completed_at + timedelta(seconds=30))

    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    events = db_session.scalars(select(WordStudyEvent.event_type).order_by(WordStudyEvent.id)).all()
    assert [progress.study_count for progress in progress_rows] == [0, 0]
    assert {progress.status for progress in progress_rows} == {"unlearned"}
    assert events == ["study_completed", "study_completed", "undo_page_completion", "undo_page_completion"]


def test_undo_completion_rejects_an_older_active_session(db_session):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    first = service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc))
    second = service.complete_page(page_id=page.id, completed_at=datetime(2026, 9, 4, 9, tzinfo=timezone.utc))

    with pytest.raises(ValueError, match="latest completion"):
        service.undo_completion(
            session_id=first.id,
            now=second.completed_at + timedelta(seconds=30),
        )

    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    assert [progress.study_count for progress in progress_rows] == [2, 2]
    assert page.completed_at == second.completed_at


def test_undo_completion_rejects_a_session_outside_the_short_window(db_session):
    import_words(db_session, "Deck", ["alpha"])
    service = StudyPageService(db_session, undo_window_seconds=300)
    page = service.get_or_create_next_page(user_id=1, page_size=1)
    completed_at = datetime(2026, 9, 4, 8, tzinfo=timezone.utc)
    session = service.complete_page(page_id=page.id, completed_at=completed_at)

    with pytest.raises(ValueError, match="undo window"):
        service.undo_completion(session_id=session.id, now=completed_at + timedelta(seconds=301))

    progress = db_session.scalar(select(WordProgress))
    event_types = db_session.scalars(select(WordStudyEvent.event_type).order_by(WordStudyEvent.id)).all()
    assert progress.study_count == 1
    assert session.undone_at is None
    assert event_types == ["study_completed"]


def test_undo_latest_completion_restores_previous_session_state(db_session):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    first_at = datetime(2026, 9, 4, 8, tzinfo=timezone.utc)
    second_at = datetime(2026, 9, 4, 9, tzinfo=timezone.utc)
    service.complete_page(page_id=page.id, completed_at=first_at)
    second = service.complete_page(page_id=page.id, completed_at=second_at)

    service.undo_completion(session_id=second.id, now=second_at + timedelta(seconds=30))

    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    assert [progress.study_count for progress in progress_rows] == [1, 1]
    assert {progress.first_studied_at for progress in progress_rows} == {first_at}
    assert {progress.last_studied_at for progress in progress_rows} == {first_at}
    assert page.status == "completed"
    assert page.completed_at == first_at


def test_undo_completion_rolls_back_all_changes_on_failure(db_session, monkeypatch):
    import_words(db_session, "Deck", ["alpha", "beta"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=2)
    completed_at = datetime(2026, 9, 4, 8, tzinfo=timezone.utc)
    session = service.complete_page(page_id=page.id, completed_at=completed_at)

    def fail_before_commit(*args, **kwargs):
        raise RuntimeError("simulated audit failure")

    monkeypatch.setattr("app.services.study_page_service.log_operation", fail_before_commit)
    with pytest.raises(RuntimeError, match="simulated audit failure"):
        service.undo_completion(session_id=session.id, now=completed_at + timedelta(seconds=30))

    db_session.refresh(session)
    db_session.refresh(page)
    progress_rows = db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    event_types = db_session.scalars(select(WordStudyEvent.event_type).order_by(WordStudyEvent.id)).all()
    assert session.undone_at is None
    assert page.status == "completed"
    assert page.completed_at == completed_at
    assert [progress.study_count for progress in progress_rows] == [1, 1]
    assert event_types == ["study_completed", "study_completed"]


def test_undo_completion_rejects_repeated_undo(db_session):
    import_words(db_session, "Deck", ["alpha"])
    service = StudyPageService(db_session)
    page = service.get_or_create_next_page(user_id=1, page_size=1)
    completed_at = datetime(2026, 9, 4, 8, tzinfo=timezone.utc)
    session = service.complete_page(page_id=page.id, completed_at=completed_at)
    service.undo_completion(session_id=session.id, now=completed_at + timedelta(seconds=30))

    with pytest.raises(ValueError, match="already undone"):
        service.undo_completion(session_id=session.id, now=completed_at + timedelta(seconds=60))


def test_study_page_api_next_detail_complete_and_undo(client, db_session):
    import_words(db_session, "Deck", ["alpha", "beta", "gamma"])

    next_response = client.get("/api/v1/study-pages/next", params={"page_size": 2})
    assert next_response.status_code == 200
    page_id = next_response.json()["id"]
    word_id = next_response.json()["words"][0]["word_id"]
    assert [item["word"] for item in next_response.json()["words"]] == ["alpha", "beta"]

    master_response = client.post(f"/api/v1/study-pages/{page_id}/words/{word_id}/master")
    assert master_response.status_code == 200
    assert [item["word"] for item in master_response.json()["words"]] == ["beta", "gamma"]

    detail_response = client.get(f"/api/v1/study-pages/{page_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["page_size"] == 2

    complete_response = client.post(
        f"/api/v1/study-pages/{page_id}/complete",
        json={"completed_at": "2026-09-04T08:30:00+00:00"},
    )
    assert complete_response.status_code == 201
    session_id = complete_response.json()["id"]
    assert len(complete_response.json()["snapshot"]["words"]) == 2

    undo_response = client.post(f"/api/v1/study-pages/{page_id}/undo-complete", json={"session_id": session_id})
    assert undo_response.status_code == 200
    assert undo_response.json()["status"] == "undone"


def test_study_page_api_returns_not_found_for_missing_resources(client):
    next_response = client.get("/api/v1/study-pages/next")
    complete_response = client.post(
        "/api/v1/study-pages/999/complete",
        json={"completed_at": "2026-09-04T08:30:00+00:00"},
    )
    master_response = client.post("/api/v1/study-pages/999/words/999/master")

    assert next_response.status_code == 404
    assert next_response.json()["detail"] == "No eligible words available"
    assert complete_response.status_code == 404
    assert master_response.status_code == 404
