from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Vocabulary
from app.services.vocabulary_import import ImportResult, VocabularyImportService


def ensure_default_vocabulary(db: Session, path: Path, user_id: int = 1) -> Vocabulary | None:
    if not path.is_file():
        return None
    existing = db.scalar(select(Vocabulary).where(Vocabulary.user_id == user_id, Vocabulary.filename == path.name))
    if existing is not None:
        return existing
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        result: ImportResult = VocabularyImportService(db).import_csv(
            source,
            name=path.stem,
            user_id=user_id,
            filename=path.name,
        )
    return result.vocabulary
