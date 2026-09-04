from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    vocabularies: Mapped[list["Vocabulary"]] = relationship(back_populates="user")


class Vocabulary(Base):
    __tablename__ = "vocabularies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    total_words: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="vocabularies")
    words: Mapped[list["Word"]] = relationship(back_populates="vocabulary", cascade="all, delete-orphan")

    def soft_delete(self) -> None:
        self.active = False
        self.deleted_at = utc_now()


class Word(Base):
    __tablename__ = "words"
    __table_args__ = (UniqueConstraint("vocabulary_id", "normalized_word", name="uq_words_vocabulary_normalized"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vocabulary_id: Mapped[int] = mapped_column(ForeignKey("vocabularies.id"), index=True)
    original_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    word: Mapped[str] = mapped_column(String(255))
    normalized_word: Mapped[str] = mapped_column(String(255), index=True)
    meaning: Mapped[str] = mapped_column(Text)
    source_page: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    position: Mapped[int] = mapped_column(Integer)

    vocabulary: Mapped[Vocabulary] = relationship(back_populates="words")
    progress: Mapped[list["WordProgress"]] = relationship(back_populates="word", cascade="all, delete-orphan")


class WordProgress(Base):
    __tablename__ = "word_progress"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_word_progress_user_word"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    word_id: Mapped[int] = mapped_column(ForeignKey("words.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="unlearned")
    study_count: Mapped[int] = mapped_column(Integer, default=0)
    forget_count: Mapped[int] = mapped_column(Integer, default=0)
    has_forgotten: Mapped[bool] = mapped_column(Boolean, default=False)
    first_studied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_studied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    mastered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    restored_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    recommended_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    word: Mapped[Word] = relationship(back_populates="progress")


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    operation: Mapped[str] = mapped_column(String(80), index=True)
    object_type: Mapped[str] = mapped_column(String(80))
    object_id: Mapped[str] = mapped_column(String(80))
    before_value: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    after_value: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
