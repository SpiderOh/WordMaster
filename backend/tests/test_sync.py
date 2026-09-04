import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, SyncRecord, Word, WordProgress
from app.db.session import get_db
from app.main import create_app
from app.schemas.sync import SyncEvent
from app.services.sync_service import SyncService
from app.services.vocabulary_import import VocabularyImportService


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sync.db'}", connect_args={"check_same_thread": False})
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with testing_session() as session:
        VocabularyImportService(session).import_csv(io.StringIO("word,meaning\nalpha,first\n"), name="Deck", user_id=1, filename="deck.csv")
        yield session


@pytest.fixture()
def client(db_session):
    app = create_app()

    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def event(word_id: int, event_id: str, changes: dict[str, object], at: datetime | None = None) -> SyncEvent:
    return SyncEvent(
        event_id=event_id,
        device_id="phone-a",
        client_timestamp=at or datetime.now(timezone.utc),
        entity_type="word_progress",
        entity_id=str(word_id),
        operation="merge",
        changes=changes,
    )


def test_duplicate_event_id_is_idempotent_and_increment_applies_once(db_session):
    word = db_session.scalar(select(Word))
    payload = event(word.id, "evt-1", {"study_count_delta": 2, "forget_count_delta": 1})
    service = SyncService(db_session)

    first = service.push(user_id=1, events=[payload])
    second = service.push(user_id=1, events=[payload])
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == word.id))

    assert first.results[0].status == "applied"
    assert second.results[0].status == "duplicate"
    assert progress.study_count == 2
    assert progress.forget_count == 1
    assert db_session.scalars(select(SyncRecord)).all().__len__() == 1


def test_last_modified_status_merge_records_stale_conflict(db_session):
    word = db_session.scalar(select(Word))
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == word.id))
    progress.status = "learning"
    progress.updated_at = datetime.now(timezone.utc)
    db_session.commit()
    service = SyncService(db_session)

    stale = service.push(user_id=1, events=[event(word.id, "evt-old", {"status": "mastered"}, progress.updated_at - timedelta(minutes=1))])
    fresh = service.push(user_id=1, events=[event(word.id, "evt-new", {"status": "mastered"}, progress.updated_at + timedelta(minutes=1))])
    db_session.refresh(progress)

    assert stale.results[0].status == "conflict"
    assert stale.results[0].conflict["server_value"] == "learning"
    assert fresh.results[0].status == "applied"
    assert progress.status == "mastered"


def test_push_and_pull_api_return_incremental_records(client, db_session):
    word = db_session.scalar(select(Word))
    payload = event(word.id, "evt-api", {"study_count_delta": 1}).model_dump(mode="json")

    push = client.post("/api/v1/sync/push", json={"events": [payload]})
    first_pull = client.get("/api/v1/sync/pull", params={"cursor": 0})
    next_cursor = first_pull.json()["next_cursor"]
    second_pull = client.get("/api/v1/sync/pull", params={"cursor": next_cursor})

    assert push.status_code == 200
    assert push.json()["results"][0]["status"] == "applied"
    assert [item["event_id"] for item in first_pull.json()["events"]] == ["evt-api"]
    assert second_pull.json() == {"events": [], "next_cursor": next_cursor}


def test_invalid_batch_rolls_back_all_events_and_returns_400(client, db_session):
    word = db_session.scalar(select(Word))
    valid = event(word.id, "evt-valid", {"study_count_delta": 1}).model_dump(mode="json")
    invalid = event(word.id, "evt-invalid", {"forget_count_delta": -1}).model_dump(mode="json")

    response = client.post("/api/v1/sync/push", json={"events": [valid, invalid]})
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == word.id))

    assert response.status_code == 400
    assert progress.study_count == 0
    assert db_session.scalars(select(SyncRecord)).all() == []


def test_sync_rejects_unknown_word_ids(db_session):
    with pytest.raises(ValueError, match="Word is not available"):
        SyncService(db_session).push(user_id=1, events=[event(999_999, "evt-unknown", {"study_count_delta": 1})])

    assert db_session.scalars(select(SyncRecord)).all() == []
