import csv
import io
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    StudyPage,
    StudyPageWord,
    StudySession,
    Vocabulary,
    Word,
    WordProgress,
    WordStudyEvent,
)
from app.services.audit import log_operation


class ForgettingNotFoundError(ValueError):
    pass


@dataclass(frozen=True)
class ForgottenWordItem:
    word_id: int
    word: str
    meaning: str
    vocabulary_id: int
    vocabulary_name: str
    status: str
    study_count: int
    forget_count: int
    last_forgotten_at: datetime | None


class ForgettingService:
    def __init__(self, db: Session):
        self.db = db

    def mark_forgotten(
        self,
        user_id: int,
        word_id: int,
        session_id: int | None = None,
        page_id: int | None = None,
    ) -> WordProgress:
        try:
            context_page_id, context_session_id = self._require_forgetting_context(
                user_id=user_id,
                word_id=word_id,
                session_id=session_id,
                page_id=page_id,
            )
            progress = self._require_progress(user_id=user_id, word_id=word_id)
            now = datetime.now(timezone.utc)
            progress.forget_count += 1
            progress.has_forgotten = True
            progress.needs_special_attention = True
            self.db.add(
                WordStudyEvent(
                    user_id=user_id,
                    word_id=word_id,
                    page_id=context_page_id,
                    session_id=context_session_id,
                    event_type="mark_forgotten",
                    created_at=now,
                    delta={"forget_count": 1},
                )
            )
            log_operation(
                self.db,
                user_id=user_id,
                operation="word_mark_forgotten",
                object_type="word",
                object_id=word_id,
                after={"forget_count": progress.forget_count, "session_id": context_session_id},
            )
            self.db.commit()
            self.db.refresh(progress)
            return progress
        except Exception:
            self.db.rollback()
            raise

    def undo_last_forgetting(self, user_id: int, word_id: int) -> WordProgress:
        try:
            progress = self._require_progress(user_id=user_id, word_id=word_id)
            events = list(
                self.db.scalars(
                    select(WordStudyEvent)
                    .where(
                        WordStudyEvent.user_id == user_id,
                        WordStudyEvent.word_id == word_id,
                        WordStudyEvent.event_type.in_(["mark_forgotten", "undo_forgetting"]),
                    )
                    .order_by(WordStudyEvent.created_at.desc(), WordStudyEvent.id.desc())
                )
            )
            undone_ids = {
                int(event.delta["target_event_id"])
                for event in events
                if event.event_type == "undo_forgetting" and event.delta and "target_event_id" in event.delta
            }
            target = next(
                (event for event in events if event.event_type == "mark_forgotten" and event.id not in undone_ids),
                None,
            )
            if target is None:
                raise ForgettingNotFoundError("No forgetting event available to undo")

            now = datetime.now(timezone.utc)
            progress.forget_count = max(0, progress.forget_count - 1)
            progress.has_forgotten = progress.forget_count > 0
            progress.needs_special_attention = progress.forget_count > 0
            self.db.add(
                WordStudyEvent(
                    user_id=user_id,
                    word_id=word_id,
                    page_id=target.page_id,
                    session_id=target.session_id,
                    event_type="undo_forgetting",
                    created_at=now,
                    delta={"forget_count": -1, "target_event_id": target.id},
                )
            )
            log_operation(
                self.db,
                user_id=user_id,
                operation="word_undo_forgetting",
                object_type="word",
                object_id=word_id,
                after={"forget_count": progress.forget_count, "target_event_id": target.id},
            )
            self.db.commit()
            self.db.refresh(progress)
            return progress
        except Exception:
            self.db.rollback()
            raise

    def restore_mastered(self, user_id: int, word_id: int) -> WordProgress:
        try:
            progress = self._require_progress(user_id=user_id, word_id=word_id)
            if progress.status != "mastered":
                raise ValueError("Word is not mastered")
            now = datetime.now(timezone.utc)
            progress.status = "unlearned"
            progress.mastered_at = None
            progress.restored_at = now
            self.db.add(
                WordStudyEvent(
                    user_id=user_id,
                    word_id=word_id,
                    event_type="restore_mastered",
                    created_at=now,
                    delta={"status": "unlearned"},
                )
            )
            log_operation(
                self.db,
                user_id=user_id,
                operation="word_restore_mastered",
                object_type="word",
                object_id=word_id,
                after={"status": "unlearned"},
            )
            self.db.commit()
            self.db.refresh(progress)
            return progress
        except Exception:
            self.db.rollback()
            raise

    def list_forgotten(
        self,
        user_id: int,
        search: str | None = None,
        vocabulary_id: int | None = None,
        status: str | None = None,
        forgotten_since: date | None = None,
    ) -> list[ForgottenWordItem]:
        statement = (
            select(Word, WordProgress, Vocabulary)
            .join(WordProgress, WordProgress.word_id == Word.id)
            .join(Vocabulary, Vocabulary.id == Word.vocabulary_id)
            .where(
                WordProgress.user_id == user_id,
                WordProgress.forget_count > 0,
                Vocabulary.user_id == user_id,
                Vocabulary.deleted_at.is_(None),
            )
            .order_by(WordProgress.forget_count.desc(), Word.normalized_word, Word.id)
        )
        if search:
            statement = statement.where(Word.normalized_word.contains(search.strip().casefold()))
        if vocabulary_id is not None:
            statement = statement.where(Word.vocabulary_id == vocabulary_id)
        if status is not None:
            statement = statement.where(WordProgress.status == status)

        items: list[ForgottenWordItem] = []
        for word, progress, vocabulary in self.db.execute(statement):
            events = list(
                self.db.scalars(
                    select(WordStudyEvent)
                    .where(
                        WordStudyEvent.user_id == user_id,
                        WordStudyEvent.word_id == word.id,
                        WordStudyEvent.event_type.in_(["mark_forgotten", "undo_forgetting"]),
                    )
                    .order_by(WordStudyEvent.created_at.desc(), WordStudyEvent.id.desc())
                )
            )
            undone_ids = {
                int(event.delta["target_event_id"])
                for event in events
                if event.event_type == "undo_forgetting" and event.delta and "target_event_id" in event.delta
            }
            latest = next(
                (event for event in events if event.event_type == "mark_forgotten" and event.id not in undone_ids),
                None,
            )
            item = ForgottenWordItem(
                    word_id=word.id,
                    word=word.word,
                    meaning=word.meaning,
                    vocabulary_id=vocabulary.id,
                    vocabulary_name=vocabulary.name,
                    status=progress.status,
                    study_count=progress.study_count,
                    forget_count=progress.forget_count,
                    last_forgotten_at=latest.created_at if latest else None,
                )
            if forgotten_since is None or (
                item.last_forgotten_at is not None and item.last_forgotten_at.date() >= forgotten_since
            ):
                items.append(item)
        return items

    def export_forgotten_csv(self, user_id: int) -> str:
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(
            ["word", "meaning", "vocabulary", "status", "study_count", "forget_count", "last_forgotten_at"]
        )
        for item in self.list_forgotten(user_id=user_id):
            writer.writerow(
                [
                    item.word,
                    item.meaning,
                    item.vocabulary_name,
                    item.status,
                    item.study_count,
                    item.forget_count,
                    item.last_forgotten_at.isoformat() if item.last_forgotten_at else "",
                ]
            )
        return output.getvalue()

    def create_special_page(self, user_id: int, word_ids: list[int]) -> StudyPage:
        try:
            unique_word_ids = list(dict.fromkeys(word_ids))
            if not unique_word_ids:
                raise ValueError("At least one word is required")
            progress_rows = list(
                self.db.scalars(
                    select(WordProgress).where(
                        WordProgress.user_id == user_id,
                        WordProgress.word_id.in_(unique_word_ids),
                        WordProgress.forget_count > 0,
                    )
                )
            )
            progress_by_word = {progress.word_id: progress for progress in progress_rows}
            if set(progress_by_word) != set(unique_word_ids):
                raise ValueError("Special pages require forgotten words owned by the user")

            next_number = (
                self.db.scalar(select(func.max(StudyPage.page_number)).where(StudyPage.user_id == user_id)) or 0
            ) + 1
            page = StudyPage(
                user_id=user_id,
                page_number=next_number,
                page_size=len(unique_word_ids),
                page_type="special",
            )
            self.db.add(page)
            self.db.flush()
            for display_order, word_id in enumerate(unique_word_ids, start=1):
                progress_by_word[word_id].needs_special_attention = True
                self.db.add(
                    StudyPageWord(
                        page_id=page.id,
                        word_id=word_id,
                        display_order=display_order,
                        join_reason="forgotten_special",
                    )
                )
            log_operation(
                self.db,
                user_id=user_id,
                operation="special_page_create",
                object_type="study_page",
                object_id=page.id,
                after={"word_ids": unique_word_ids},
            )
            self.db.commit()
            self.db.refresh(page)
            return page
        except Exception:
            self.db.rollback()
            raise

    def complete_special_page(
        self,
        user_id: int,
        page_id: int,
        outcomes: dict[int, str],
        completed_at: datetime,
    ) -> StudySession:
        try:
            page = self.db.get(StudyPage, page_id)
            if page is None or page.user_id != user_id or page.page_type != "special":
                raise ForgettingNotFoundError("Special study page not found")
            if page.status == "completed":
                raise ValueError("Special study page was already completed")
            links = list(
                self.db.scalars(
                    select(StudyPageWord)
                    .where(StudyPageWord.page_id == page_id, StudyPageWord.active.is_(True))
                    .order_by(StudyPageWord.display_order, StudyPageWord.id)
                )
            )
            active_word_ids = {link.word_id for link in links}
            if set(outcomes) != active_word_ids:
                raise ValueError("An outcome is required for every active special-page word")
            if not set(outcomes.values()).issubset({"remembered", "forgotten", "mastered"}):
                raise ValueError("Unsupported special-page outcome")

            snapshot_words = []
            for link in links:
                word = self.db.get(Word, link.word_id)
                snapshot_words.append(
                    {
                        "word_id": word.id,
                        "word": word.word,
                        "meaning": word.meaning,
                        "display_order": link.display_order,
                        "outcome": outcomes[word.id],
                    }
                )
            session = StudySession(
                user_id=user_id,
                page_id=page.id,
                completed_at=completed_at,
                study_count_increment=0,
                snapshot={"page_id": page.id, "page_type": "special", "words": snapshot_words},
            )
            self.db.add(session)
            self.db.flush()

            now = completed_at
            for link in links:
                progress = self._require_progress(user_id=user_id, word_id=link.word_id)
                outcome = outcomes[link.word_id]
                event_type = "special_remembered"
                delta: dict[str, object] = {"needs_special_attention": False}
                if outcome == "remembered":
                    progress.needs_special_attention = False
                elif outcome == "forgotten":
                    progress.forget_count += 1
                    progress.has_forgotten = True
                    progress.needs_special_attention = True
                    event_type = "mark_forgotten"
                    delta = {"forget_count": 1, "needs_special_attention": True}
                else:
                    progress.status = "mastered"
                    progress.mastered_at = now
                    progress.needs_special_attention = False
                    event_type = "special_mastered"
                    delta = {"status": "mastered", "needs_special_attention": False}
                link.active = False
                link.removed_at = now
                self.db.add(
                    WordStudyEvent(
                        user_id=user_id,
                        word_id=link.word_id,
                        page_id=page.id,
                        session_id=session.id,
                        event_type=event_type,
                        created_at=now,
                        delta=delta,
                    )
                )

            page.status = "completed"
            page.completed_at = completed_at
            log_operation(
                self.db,
                user_id=user_id,
                operation="special_page_complete",
                object_type="study_page",
                object_id=page.id,
                after={"session_id": session.id, "outcomes": {str(key): value for key, value in outcomes.items()}},
            )
            self.db.commit()
            self.db.refresh(session)
            return session
        except Exception:
            self.db.rollback()
            raise

    def _require_progress(self, user_id: int, word_id: int) -> WordProgress:
        progress = self.db.scalar(
            select(WordProgress).where(WordProgress.user_id == user_id, WordProgress.word_id == word_id)
        )
        if progress is None:
            raise ForgettingNotFoundError("Word progress not found")
        return progress

    def _require_session_word(self, user_id: int, word_id: int, session_id: int) -> StudySession:
        session = self.db.get(StudySession, session_id)
        if session is None or session.user_id != user_id or session.undone_at is not None:
            raise ForgettingNotFoundError("Study session not found")
        if not any(int(item["word_id"]) == word_id for item in session.snapshot.get("words", [])):
            raise ValueError("Word does not belong to this study session")
        return session

    def _require_forgetting_context(
        self,
        user_id: int,
        word_id: int,
        session_id: int | None,
        page_id: int | None,
    ) -> tuple[int, int | None]:
        if session_id is not None:
            session = self._require_session_word(user_id=user_id, word_id=word_id, session_id=session_id)
            if page_id is not None and session.page_id != page_id:
                raise ValueError("Study session does not belong to this page")
            return session.page_id, session.id
        if page_id is None:
            raise ValueError("Page or session context is required")
        page = self.db.get(StudyPage, page_id)
        link = self.db.scalar(
            select(StudyPageWord).where(
                StudyPageWord.page_id == page_id,
                StudyPageWord.word_id == word_id,
                StudyPageWord.active.is_(True),
            )
        )
        if page is None or page.user_id != user_id or page.status != "in_progress" or link is None:
            raise ForgettingNotFoundError("Active study-page word not found")
        return page.id, None
