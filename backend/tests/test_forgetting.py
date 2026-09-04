import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, StudyPageWord, Word, WordProgress, WordStudyEvent
from app.db.session import get_db
from app.main import create_app
from app.services.forgetting_service import ForgettingService
from app.services.study_page_service import StudyPageService
from app.services.vocabulary_import import VocabularyImportService


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'wordmaster-forgetting.db'}",
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


def create_completed_session(db_session, words: list[str]):
    csv_text = "word,meaning\n" + "\n".join(f"{word},{word} meaning" for word in words) + "\n"
    VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text), name="Deck", user_id=1, filename="deck.csv"
    )
    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=len(words))
    session = StudyPageService(db_session).complete_page(
        page_id=page.id,
        completed_at=datetime(2026, 9, 4, 8, tzinfo=timezone.utc),
    )
    word = db_session.scalar(select(Word).order_by(Word.id))
    return page, session, word


def test_forgetting_events_accumulate_and_last_forgetting_can_be_undone(db_session):
    _, session, word = create_completed_session(db_session, ["alpha"])
    service = ForgettingService(db_session)

    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=session.id)
    progress = service.undo_last_forgetting(user_id=1, word_id=word.id)

    event_types = db_session.scalars(select(WordStudyEvent.event_type).order_by(WordStudyEvent.id)).all()
    assert progress.forget_count == 1
    assert progress.has_forgotten is True
    assert event_types == ["study_completed", "mark_forgotten", "mark_forgotten", "undo_forgetting"]


def test_restore_mastered_word_returns_it_to_the_unlearned_queue(db_session):
    csv_text = "word,meaning\nalpha,alpha meaning\n"
    VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text), name="Deck", user_id=1, filename="deck.csv"
    )
    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=1)
    word = db_session.scalar(select(Word))
    StudyPageService(db_session).replace_mastered_word(page_id=page.id, word_id=word.id)

    progress = ForgettingService(db_session).restore_mastered(user_id=1, word_id=word.id)
    next_page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=1)

    assert progress.status == "unlearned"
    assert progress.mastered_at is None
    assert progress.restored_at is not None
    assert next_page.status == "in_progress"


def test_forgotten_words_are_sorted_by_count_and_searchable(db_session):
    _, session, alpha = create_completed_session(db_session, ["alpha", "beta"])
    beta = db_session.scalar(select(Word).where(Word.word == "beta"))
    service = ForgettingService(db_session)
    service.mark_forgotten(user_id=1, word_id=beta.id, session_id=session.id)
    service.mark_forgotten(user_id=1, word_id=alpha.id, session_id=session.id)
    service.mark_forgotten(user_id=1, word_id=alpha.id, session_id=session.id)

    all_items = service.list_forgotten(user_id=1)
    search_items = service.list_forgotten(user_id=1, search="ALP")

    assert [(item.word, item.forget_count) for item in all_items] == [("alpha", 2), ("beta", 1)]
    assert [item.word for item in search_items] == ["alpha"]
    assert all_items[0].last_forgotten_at is not None


def test_special_page_resolves_remembered_forgotten_and_mastered_words(db_session):
    _, original_session, alpha = create_completed_session(db_session, ["alpha", "beta", "gamma"])
    words = db_session.scalars(select(Word).order_by(Word.id)).all()
    service = ForgettingService(db_session)
    for word in words:
        service.mark_forgotten(user_id=1, word_id=word.id, session_id=original_session.id)

    page = service.create_special_page(user_id=1, word_ids=[word.id for word in words])
    special_session = service.complete_special_page(
        user_id=1,
        page_id=page.id,
        outcomes={alpha.id: "remembered", words[1].id: "forgotten", words[2].id: "mastered"},
        completed_at=datetime(2026, 9, 5, 8, tzinfo=timezone.utc),
    )

    progress_rows = {
        progress.word_id: progress
        for progress in db_session.scalars(select(WordProgress).order_by(WordProgress.word_id)).all()
    }
    active_links = db_session.scalars(
        select(StudyPageWord).where(StudyPageWord.page_id == page.id, StudyPageWord.active.is_(True))
    ).all()
    assert page.page_type == "special"
    assert page.status == "completed"
    assert special_session.snapshot["page_type"] == "special"
    assert progress_rows[alpha.id].needs_special_attention is False
    assert progress_rows[words[1].id].forget_count == 2
    assert progress_rows[words[1].id].needs_special_attention is True
    assert progress_rows[words[2].id].status == "mastered"
    assert progress_rows[words[2].id].needs_special_attention is False
    assert active_links == []


def test_completed_special_page_cannot_be_completed_again(db_session):
    _, original_session, word = create_completed_session(db_session, ["alpha"])
    service = ForgettingService(db_session)
    service.mark_forgotten(user_id=1, word_id=word.id, session_id=original_session.id)
    page = service.create_special_page(user_id=1, word_ids=[word.id])
    service.complete_special_page(
        user_id=1,
        page_id=page.id,
        outcomes={word.id: "remembered"},
        completed_at=datetime(2026, 9, 5, 8, tzinfo=timezone.utc),
    )

    with pytest.raises(ValueError, match="already completed"):
        service.complete_special_page(
            user_id=1,
            page_id=page.id,
            outcomes={},
            completed_at=datetime(2026, 9, 5, 9, tzinfo=timezone.utc),
        )


def test_forgetting_api_marks_lists_and_undoes(client, db_session):
    page, session, word = create_completed_session(db_session, ["alpha"])

    mark_response = client.post(
        f"/api/v1/study-pages/{page.id}/words/{word.id}/forget",
        json={"session_id": session.id},
    )
    list_response = client.get("/api/v1/forgotten-words")
    undo_response = client.post(f"/api/v1/forgotten-words/{word.id}/undo")

    assert mark_response.status_code == 200
    assert mark_response.json()["forget_count"] == 1
    assert list_response.status_code == 200
    assert list_response.json()[0]["word"] == "alpha"
    assert undo_response.status_code == 200
    assert undo_response.json()["forget_count"] == 0
    assert undo_response.json()["needs_special_attention"] is False


def test_forgetting_on_an_unfinished_page_saves_without_incrementing_study_count(client, db_session):
    csv_text = "word,meaning\nalpha,alpha meaning\n"
    VocabularyImportService(db_session).import_csv(
        io.StringIO(csv_text), name="Deck", user_id=1, filename="deck.csv"
    )
    page = StudyPageService(db_session).get_or_create_next_page(user_id=1, page_size=1)
    word = db_session.scalar(select(Word))

    response = client.post(f"/api/v1/study-pages/{page.id}/words/{word.id}/forget", json={})

    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == word.id))
    event = db_session.scalar(select(WordStudyEvent).where(WordStudyEvent.event_type == "mark_forgotten"))
    assert response.status_code == 200
    assert progress.forget_count == 1
    assert progress.study_count == 0
    assert event.page_id == page.id
    assert event.session_id is None


def test_forgotten_words_api_filters_and_exports_csv(client, db_session):
    page, session, word = create_completed_session(db_session, ["alpha"])
    client.post(
        f"/api/v1/study-pages/{page.id}/words/{word.id}/forget",
        json={"session_id": session.id},
    )

    matching = client.get(
        "/api/v1/forgotten-words",
        params={"vocabulary_id": word.vocabulary_id, "status": "learning"},
    )
    non_matching = client.get("/api/v1/forgotten-words", params={"vocabulary_id": word.vocabulary_id + 999})
    export_response = client.get("/api/v1/forgotten-words/export")

    assert matching.status_code == 200
    assert [item["word"] for item in matching.json()] == ["alpha"]
    assert non_matching.json() == []
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("text/csv")
    assert "word,meaning,vocabulary,status,study_count,forget_count,last_forgotten_at" in export_response.text
    assert "alpha,alpha meaning,Deck,learning,1,1," in export_response.text


def test_special_page_and_restore_mastered_api(client, db_session):
    page, original_session, alpha = create_completed_session(db_session, ["alpha", "beta"])
    beta = db_session.scalar(select(Word).where(Word.word == "beta"))
    for word in [alpha, beta]:
        client.post(
            f"/api/v1/study-pages/{page.id}/words/{word.id}/forget",
            json={"session_id": original_session.id},
        )

    create_response = client.post(
        "/api/v1/forgotten-words/special-page",
        json={"word_ids": [alpha.id, beta.id]},
    )
    special_page_id = create_response.json()["id"]
    complete_response = client.post(
        f"/api/v1/forgotten-words/special-pages/{special_page_id}/complete",
        json={
            "completed_at": "2026-09-05T08:00:00+00:00",
            "outcomes": {str(alpha.id): "remembered", str(beta.id): "mastered"},
        },
    )
    restore_response = client.post(f"/api/v1/forgotten-words/{beta.id}/restore")

    assert create_response.status_code == 201
    assert create_response.json()["page_type"] == "special"
    assert complete_response.status_code == 201
    assert complete_response.json()["snapshot"]["page_type"] == "special"
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "unlearned"
