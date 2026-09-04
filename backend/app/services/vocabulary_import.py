import csv
from dataclasses import dataclass
from typing import TextIO

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import User, Vocabulary, Word, WordProgress
from app.services.audit import log_operation


def normalize_word(value: str) -> str:
    return value.strip().casefold()


@dataclass(frozen=True)
class RowError:
    row_number: int
    code: str
    message: str


@dataclass(frozen=True)
class ImportResult:
    vocabulary: Vocabulary
    imported_count: int
    row_errors: list[RowError]

    def to_dict(self) -> dict[str, object]:
        return {
            "vocabulary": self.vocabulary,
            "imported_count": self.imported_count,
            "row_errors": [error.__dict__ for error in self.row_errors],
        }


class VocabularyImportService:
    def __init__(self, db: Session):
        self.db = db

    def import_csv(self, file: TextIO, name: str, user_id: int, filename: str = "uploaded.csv") -> ImportResult:
        self._ensure_user(user_id)
        reader = csv.DictReader(file)
        if reader.fieldnames is None:
            raise ValueError("CSV is empty")

        fieldnames = {field.strip() for field in reader.fieldnames if field}
        required = {"word", "meaning"}
        missing = required - fieldnames
        if missing:
            raise ValueError(f"CSV missing required columns: {', '.join(sorted(missing))}")

        vocabulary = Vocabulary(
            user_id=user_id,
            name=name.strip(),
            filename=filename,
            priority=self._next_priority(user_id),
        )
        self.db.add(vocabulary)
        self.db.flush()

        row_errors: list[RowError] = []
        seen: set[str] = set()
        imported_count = 0
        for position, row in enumerate(reader, start=1):
            row_number = position + 1
            word_value = (row.get("word") or "").strip()
            meaning_value = row.get("meaning") or ""
            if not word_value or not meaning_value:
                row_errors.append(
                    RowError(
                        row_number=row_number,
                        code="missing_required_field",
                        message="word and meaning are required",
                    )
                )
                continue

            normalized = normalize_word(word_value)
            if normalized in seen:
                row_errors.append(
                    RowError(
                        row_number=row_number,
                        code="duplicate_word",
                        message=f"duplicate normalized word: {normalized}",
                    )
                )
                continue
            seen.add(normalized)

            word = Word(
                vocabulary_id=vocabulary.id,
                original_number=self._optional_value(row.get("number")),
                word=word_value,
                normalized_word=normalized,
                meaning=meaning_value,
                source_page=self._optional_value(row.get("source_page")),
                position=position,
            )
            self.db.add(word)
            self.db.flush()
            self.db.add(WordProgress(user_id=user_id, word_id=word.id))
            imported_count += 1

        vocabulary.total_words = imported_count
        log_operation(
            self.db,
            user_id=user_id,
            operation="vocabulary_import",
            object_type="vocabulary",
            object_id=vocabulary.id,
            after={
                "name": vocabulary.name,
                "filename": vocabulary.filename,
                "total_words": imported_count,
                "row_errors": len(row_errors),
            },
        )
        self.db.commit()
        self.db.refresh(vocabulary)
        return ImportResult(vocabulary=vocabulary, imported_count=imported_count, row_errors=row_errors)

    def _ensure_user(self, user_id: int) -> None:
        if self.db.get(User, user_id) is not None:
            return
        self.db.add(User(id=user_id, username="local" if user_id == 1 else f"user-{user_id}"))
        self.db.flush()

    def _next_priority(self, user_id: int) -> int:
        current = self.db.scalar(select(func.max(Vocabulary.priority)).where(Vocabulary.user_id == user_id))
        return int(current or 0) + 1

    @staticmethod
    def _optional_value(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None
