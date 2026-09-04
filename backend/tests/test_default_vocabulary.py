from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, Vocabulary, Word
from app.services.default_vocabulary import ensure_default_vocabulary


def test_default_vocabulary_imports_once_and_keeps_existing_data(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'default.db'}")
    testing_session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    source = tmp_path / "reden_vocabulary_6550.csv"
    source.write_text("number,word,meaning,source_page\n1,Alpha,第一词,1\n2,Beta,第二词,1\n", encoding="utf-8")

    with testing_session() as db:
        first = ensure_default_vocabulary(db, source)
        second = ensure_default_vocabulary(db, source)

        assert first is not None
        assert second.id == first.id
        assert db.scalars(select(Vocabulary)).all().__len__() == 1
        assert db.scalars(select(Word)).all().__len__() == 2


def test_missing_default_vocabulary_is_reported_without_breaking_startup(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'missing.db'}")
    testing_session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    with testing_session() as db:
        assert ensure_default_vocabulary(db, Path(tmp_path / "missing.csv")) is None
