from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import (
    StudyPage,
    StudyPageWord,
    StudySession,
    UserSettings,
    Vocabulary,
    Word,
    WordProgress,
    WordStudyEvent,
)
from app.services.audit import log_operation


BACKUP_VERSION = 1
BACKUP_MODELS = {
    "vocabularies": Vocabulary,
    "words": Word,
    "word_progress": WordProgress,
    "study_pages": StudyPage,
    "study_page_words": StudyPageWord,
    "study_sessions": StudySession,
    "word_study_events": WordStudyEvent,
}
DATETIME_FIELDS = {
    "vocabularies": {"imported_at", "deleted_at"},
    "word_progress": {"first_studied_at", "last_studied_at", "mastered_at", "restored_at", "recommended_date", "updated_at"},
    "study_pages": {"created_at", "completed_at"},
    "study_page_words": {"created_at", "removed_at"},
    "study_sessions": {"completed_at", "undone_at"},
    "word_study_events": {"created_at"},
    "user_settings": {"updated_at"},
}


class BackupValidationError(ValueError):
    pass


class BackupService:
    def __init__(self, db: Session):
        self.db = db

    def export_json(self, user_id: int) -> dict[str, Any]:
        vocabularies = list(self.db.scalars(select(Vocabulary).where(Vocabulary.user_id == user_id)))
        vocabulary_ids = {item.id for item in vocabularies}
        pages = list(self.db.scalars(select(StudyPage).where(StudyPage.user_id == user_id)))
        page_ids = {item.id for item in pages}
        data = {
            "vocabularies": self._serialize_rows("vocabularies", vocabularies),
            "words": self._serialize_rows(
                "words", list(self.db.scalars(select(Word).where(Word.vocabulary_id.in_(vocabulary_ids))))
            )
            if vocabulary_ids
            else [],
            "word_progress": self._serialize_rows(
                "word_progress", list(self.db.scalars(select(WordProgress).where(WordProgress.user_id == user_id)))
            ),
            "study_pages": self._serialize_rows("study_pages", pages),
            "study_page_words": self._serialize_rows(
                "study_page_words", list(self.db.scalars(select(StudyPageWord).where(StudyPageWord.page_id.in_(page_ids))))
            )
            if page_ids
            else [],
            "study_sessions": self._serialize_rows(
                "study_sessions", list(self.db.scalars(select(StudySession).where(StudySession.user_id == user_id)))
            ),
            "word_study_events": self._serialize_rows(
                "word_study_events",
                list(self.db.scalars(select(WordStudyEvent).where(WordStudyEvent.user_id == user_id))),
            ),
            "user_settings": self._serialize_rows(
                "user_settings", [settings] if (settings := self.db.get(UserSettings, user_id)) else []
            ),
        }
        return {"version": BACKUP_VERSION, "exported_at": datetime.now(timezone.utc).isoformat(), "data": data}

    def import_json(self, user_id: int, payload: dict[str, Any]) -> None:
        self._validate(payload)
        data = payload["data"]
        try:
            vocabulary_ids = [item.id for item in self.db.scalars(select(Vocabulary).where(Vocabulary.user_id == user_id))]
            page_ids = [item.id for item in self.db.scalars(select(StudyPage).where(StudyPage.user_id == user_id))]
            if page_ids:
                self.db.execute(delete(WordStudyEvent).where(WordStudyEvent.user_id == user_id))
                self.db.execute(delete(StudySession).where(StudySession.user_id == user_id))
                self.db.execute(delete(StudyPageWord).where(StudyPageWord.page_id.in_(page_ids)))
                self.db.execute(delete(StudyPage).where(StudyPage.user_id == user_id))
            else:
                self.db.execute(delete(WordStudyEvent).where(WordStudyEvent.user_id == user_id))
                self.db.execute(delete(StudySession).where(StudySession.user_id == user_id))
            self.db.execute(delete(WordProgress).where(WordProgress.user_id == user_id))
            if vocabulary_ids:
                self.db.execute(delete(Word).where(Word.vocabulary_id.in_(vocabulary_ids)))
            self.db.execute(delete(Vocabulary).where(Vocabulary.user_id == user_id))
            self.db.execute(delete(UserSettings).where(UserSettings.user_id == user_id))

            for table_name, model in BACKUP_MODELS.items():
                for row in data[table_name]:
                    values = self._deserialize_row(table_name, row)
                    if "user_id" in values:
                        values["user_id"] = user_id
                    self.db.add(model(**values))
                self.db.flush()
            for row in data["user_settings"]:
                values = self._deserialize_row("user_settings", row)
                values["user_id"] = user_id
                self.db.add(UserSettings(**values))
            log_operation(
                self.db,
                user_id=user_id,
                operation="backup_import",
                object_type="user",
                object_id=user_id,
                after={"version": BACKUP_VERSION},
            )
            self.db.commit()
            self.db.expire_all()
        except Exception:
            self.db.rollback()
            raise

    def _validate(self, payload: dict[str, Any]) -> None:
        if payload.get("version") != BACKUP_VERSION or not isinstance(payload.get("data"), dict):
            raise BackupValidationError("Unsupported or malformed backup")
        data = payload["data"]
        required = set(BACKUP_MODELS) | {"user_settings"}
        if not required.issubset(data) or any(not isinstance(data[name], list) for name in required):
            raise BackupValidationError("Backup data tables are incomplete")
        vocabulary_ids = self._unique_ids(data["vocabularies"], "vocabularies")
        word_ids = self._unique_ids(data["words"], "words")
        page_ids = self._unique_ids(data["study_pages"], "study_pages")
        session_ids = self._unique_ids(data["study_sessions"], "study_sessions")
        if any(row.get("vocabulary_id") not in vocabulary_ids for row in data["words"]):
            raise BackupValidationError("Word references an unknown vocabulary")
        if any(row.get("word_id") not in word_ids for row in data["word_progress"]):
            raise BackupValidationError("Progress references an unknown word")
        if any(
            row.get("page_id") not in page_ids or row.get("word_id") not in word_ids
            for row in data["study_page_words"]
        ):
            raise BackupValidationError("Page word contains an invalid reference")
        if any(row.get("page_id") not in page_ids for row in data["study_sessions"]):
            raise BackupValidationError("Session references an unknown page")
        if any(
            row.get("word_id") not in word_ids
            or (row.get("page_id") is not None and row.get("page_id") not in page_ids)
            or (row.get("session_id") is not None and row.get("session_id") not in session_ids)
            for row in data["word_study_events"]
        ):
            raise BackupValidationError("Study event contains an invalid reference")

    @staticmethod
    def _unique_ids(rows: list[dict[str, Any]], table_name: str) -> set[int]:
        ids = [row.get("id") for row in rows]
        if any(not isinstance(value, int) for value in ids) or len(ids) != len(set(ids)):
            raise BackupValidationError(f"{table_name} contains invalid IDs")
        return set(ids)

    @staticmethod
    def _serialize_rows(table_name: str, rows: list[Any]) -> list[dict[str, Any]]:
        serialized = []
        for row in rows:
            values: dict[str, Any] = {}
            for column in row.__table__.columns:
                value = getattr(row, column.name)
                values[column.name] = value.isoformat() if isinstance(value, datetime) else value
            serialized.append(values)
        return serialized

    @staticmethod
    def _deserialize_row(table_name: str, row: dict[str, Any]) -> dict[str, Any]:
        values = dict(row)
        for field in DATETIME_FIELDS.get(table_name, set()):
            if values.get(field) is not None:
                values[field] = datetime.fromisoformat(values[field].replace("Z", "+00:00"))
        return values
