import csv
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, OperationLog, Vocabulary, Word, WordProgress
from app.db.session import get_db
from app.main import create_app
from app.services.vocabulary_import import VocabularyImportService, normalize_word


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'wordmaster-test.db'}",
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
    return TestClient(app)


def import_text(db_session, csv_text: str, name: str = "Reden"):
    service = VocabularyImportService(db_session)
    return service.import_csv(io.StringIO(csv_text), name=name, user_id=1, filename=f"{name}.csv")


def test_normalize_word_trims_and_casefolds():
    assert normalize_word("  Radical  ") == "radical"
    assert normalize_word("SCENERY") == "scenery"


def test_import_csv_preserves_optional_fields_and_meaning_newlines(db_session):
    csv_text = 'number,word,meaning,source_page\n1, Radical ,"adj. 根本的\nn. 激进分子",7\n'

    result = import_text(db_session, csv_text)

    assert result.imported_count == 1
    assert result.row_errors == []
    word = db_session.scalar(select(Word).where(Word.normalized_word == "radical"))
    assert word is not None
    assert word.original_number == "1"
    assert word.word == "Radical"
    assert word.meaning == "adj. 根本的\nn. 激进分子"
    assert word.source_page == "7"
    progress = db_session.scalar(select(WordProgress).where(WordProgress.word_id == word.id))
    assert progress is not None
    assert progress.status == "unlearned"


def test_import_csv_reports_invalid_rows_without_blocking_valid_rows(db_session):
    csv_text = "word,meaning\n,missing word\nuseful,\nvalid,有效\n"

    result = import_text(db_session, csv_text)

    assert result.imported_count == 1
    assert [error.row_number for error in result.row_errors] == [2, 3]
    assert {error.code for error in result.row_errors} == {"missing_required_field"}
    words = db_session.scalars(select(Word)).all()
    assert [word.word for word in words] == ["valid"]


def test_import_csv_accepts_missing_optional_columns(db_session):
    result = import_text(db_session, "word,meaning\nplain,朴素的\n")

    word = db_session.scalar(select(Word).where(Word.normalized_word == "plain"))
    assert result.imported_count == 1
    assert word is not None
    assert word.original_number is None
    assert word.source_page is None


def test_import_csv_reports_normalized_duplicates(db_session):
    csv_text = "word,meaning\n Word ,第一个\nword,第二个\nWORD,第三个\n"

    result = import_text(db_session, csv_text)

    assert result.imported_count == 1
    assert [error.row_number for error in result.row_errors] == [3, 4]
    assert {error.code for error in result.row_errors} == {"duplicate_word"}
    words = db_session.scalars(select(Word)).all()
    assert [word.meaning for word in words] == ["第一个"]


def test_import_api_and_vocabulary_management(client, db_session):
    response = client.post(
        "/api/v1/vocabularies/import",
        data={"name": "API Reden"},
        files={"file": ("reden.csv", b"word,meaning\nalpha,one\n", "text/csv")},
    )

    assert response.status_code == 201
    body = response.json()
    vocabulary_id = body["vocabulary"]["id"]
    assert body["imported_count"] == 1

    assert client.get("/api/v1/vocabularies").json()[0]["name"] == "API Reden"
    detail = client.get(f"/api/v1/vocabularies/{vocabulary_id}").json()
    assert detail["total_words"] == 1

    renamed = client.patch(f"/api/v1/vocabularies/{vocabulary_id}", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    inactive = client.patch(f"/api/v1/vocabularies/{vocabulary_id}/active", json={"active": False})
    assert inactive.status_code == 200
    assert inactive.json()["active"] is False

    prioritized = client.patch(f"/api/v1/vocabularies/{vocabulary_id}/priority", json={"priority": 7})
    assert prioritized.status_code == 200
    assert prioritized.json()["priority"] == 7

    deleted = client.delete(f"/api/v1/vocabularies/{vocabulary_id}", params={"confirm": "Renamed"})
    assert deleted.status_code == 204
    vocabulary = db_session.get(Vocabulary, vocabulary_id)
    assert vocabulary is not None
    assert vocabulary.deleted_at is not None
    operations = db_session.scalars(select(OperationLog.operation).order_by(OperationLog.id)).all()
    assert operations == [
        "vocabulary_import",
        "vocabulary_rename",
        "vocabulary_set_active",
        "vocabulary_set_priority",
        "vocabulary_delete",
    ]


def test_fixture_and_full_sample_csv_can_be_imported(db_session):
    fixture_path = Path(__file__).parent / "fixtures" / "reden_sample.csv"
    full_sample_path = Path(__file__).parents[2] / "data" / "reden_vocabulary_6550.csv"

    fixture_result = VocabularyImportService(db_session).import_csv(
        fixture_path.open("r", encoding="utf-8", newline=""),
        name="Fixture Reden",
        user_id=1,
        filename="reden_sample.csv",
    )
    assert fixture_result.imported_count == 3
    assert fixture_result.row_errors == []

    with full_sample_path.open("r", encoding="utf-8-sig", newline="") as file:
        total_rows = sum(1 for _ in csv.DictReader(file))
    full_result = VocabularyImportService(db_session).import_csv(
        full_sample_path.open("r", encoding="utf-8-sig", newline=""),
        name="Full Reden",
        user_id=1,
        filename="reden_vocabulary_6550.csv",
    )
    assert full_result.imported_count > 6000
    assert full_result.imported_count + len(full_result.row_errors) == total_rows
