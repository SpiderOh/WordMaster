from datetime import datetime, timezone

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
from app.schemas.study_pages import StudyPageRead, StudyPageWordRead
from app.services.audit import log_operation


class StudyPageService:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create_next_page(self, user_id: int, page_size: int) -> StudyPage:
        existing = self.db.scalar(
            select(StudyPage)
            .where(
                StudyPage.user_id == user_id,
                StudyPage.status == "in_progress",
                StudyPage.page_type == "normal",
            )
            .order_by(StudyPage.created_at.desc(), StudyPage.id.desc())
        )
        if existing is not None:
            return existing

        next_number = (self.db.scalar(select(func.max(StudyPage.page_number)).where(StudyPage.user_id == user_id)) or 0) + 1
        page = StudyPage(user_id=user_id, page_number=next_number, page_size=page_size)
        self.db.add(page)
        self.db.flush()

        selected_words = self._candidate_words(user_id=user_id, limit=page_size, excluded_word_ids=set())
        for display_order, word in enumerate(selected_words, start=1):
            self.db.add(
                StudyPageWord(
                    page_id=page.id,
                    word_id=word.id,
                    display_order=display_order,
                    join_reason="new",
                )
            )
        page.is_short = len(selected_words) < page_size
        log_operation(
            self.db,
            user_id=user_id,
            operation="study_page_create",
            object_type="study_page",
            object_id=page.id,
            after={"page_size": page_size, "word_count": len(selected_words), "is_short": page.is_short},
        )
        self.db.commit()
        self.db.refresh(page)
        return page

    def get_page(self, page_id: int, user_id: int) -> StudyPage | None:
        page = self.db.get(StudyPage, page_id)
        if page is None or page.user_id != user_id:
            return None
        return page

    def replace_mastered_word(self, page_id: int, word_id: int, user_id: int = 1) -> StudyPage:
        page = self._require_page(page_id=page_id, user_id=user_id)
        link = self.db.scalar(
            select(StudyPageWord).where(
                StudyPageWord.page_id == page.id,
                StudyPageWord.word_id == word_id,
                StudyPageWord.active.is_(True),
            )
        )
        if link is None:
            raise ValueError("Word is not active on this page")

        progress = self._progress_for_word(user_id=user_id, word_id=word_id)
        if progress.study_count != 0:
            raise ValueError("Only first-study words can be marked mastered")

        now = datetime.now(timezone.utc)
        progress.status = "mastered"
        progress.mastered_at = now
        link.active = False
        link.removed_at = now
        self.db.add(
            WordStudyEvent(
                user_id=user_id,
                word_id=word_id,
                page_id=page.id,
                event_type="mark_mastered",
                created_at=now,
                delta={"status": "mastered"},
            )
        )

        active_ids = {
            word_id
            for (word_id,) in self.db.execute(
                select(StudyPageWord.word_id).where(StudyPageWord.page_id == page.id, StudyPageWord.active.is_(True))
            )
        }
        replacement = self._candidate_words(user_id=user_id, limit=1, excluded_word_ids=active_ids | {word_id})
        if replacement:
            max_order = self.db.scalar(select(func.max(StudyPageWord.display_order)).where(StudyPageWord.page_id == page.id)) or 0
            self.db.add(
                StudyPageWord(
                    page_id=page.id,
                    word_id=replacement[0].id,
                    display_order=max_order + 1,
                    join_reason="mastered_replacement",
                )
            )
        page.is_short = len(self._active_links(page.id)) + len(replacement) < page.page_size
        log_operation(
            self.db,
            user_id=user_id,
            operation="word_mark_mastered",
            object_type="word",
            object_id=word_id,
            before={"status": "unlearned"},
            after={"status": "mastered", "replacement_word_id": replacement[0].id if replacement else None},
        )
        self.db.commit()
        self.db.refresh(page)
        return page

    def complete_page(self, page_id: int, completed_at: datetime, user_id: int = 1) -> StudySession:
        page = self._require_page(page_id=page_id, user_id=user_id)
        active_links = self._active_links(page.id)
        if not active_links:
            raise ValueError("Study page has no active words")

        snapshot_words: list[dict[str, object]] = []
        for link in active_links:
            word = self.db.get(Word, link.word_id)
            progress = self._progress_for_word(user_id=user_id, word_id=word.id)
            snapshot_words.append(
                {
                    "word_id": word.id,
                    "word": word.word,
                    "meaning": word.meaning,
                    "display_order": link.display_order,
                    "status_before": progress.status,
                    "study_count_before": progress.study_count,
                    "forget_count": progress.forget_count,
                }
            )

        session = StudySession(
            user_id=user_id,
            page_id=page.id,
            completed_at=completed_at,
            snapshot={"page_id": page.id, "page_size": page.page_size, "words": snapshot_words},
        )
        self.db.add(session)
        self.db.flush()

        for snapshot_word in snapshot_words:
            progress = self._progress_for_word(user_id=user_id, word_id=int(snapshot_word["word_id"]))
            before_count = progress.study_count
            progress.study_count += 1
            progress.status = "learning"
            progress.first_studied_at = progress.first_studied_at or completed_at
            progress.last_studied_at = completed_at
            self.db.add(
                WordStudyEvent(
                    user_id=user_id,
                    word_id=progress.word_id,
                    page_id=page.id,
                    session_id=session.id,
                    event_type="study_completed",
                    created_at=completed_at,
                    delta={"study_count": 1, "before": before_count, "after": progress.study_count},
                )
            )

        page.status = "completed"
        page.completed_at = completed_at
        log_operation(
            self.db,
            user_id=user_id,
            operation="study_page_complete",
            object_type="study_page",
            object_id=page.id,
            after={"session_id": session.id, "word_count": len(snapshot_words), "completed_at": completed_at.isoformat()},
        )
        self.db.commit()
        self.db.refresh(session)
        return session

    def undo_completion(self, session_id: int, page_id: int | None = None, user_id: int = 1) -> StudySession:
        session = self.db.get(StudySession, session_id)
        if session is None or session.user_id != user_id:
            raise ValueError("Study session not found")
        if page_id is not None and session.page_id != page_id:
            raise ValueError("Study session does not belong to this page")
        if session.undone_at is not None:
            return session

        undone_at = datetime.now(timezone.utc)
        for snapshot_word in session.snapshot["words"]:
            word_id = int(snapshot_word["word_id"])
            progress = self._progress_for_word(user_id=user_id, word_id=word_id)
            progress.study_count = max(0, progress.study_count - session.study_count_increment)
            progress.status = "unlearned" if progress.study_count == 0 else "learning"
            self.db.add(
                WordStudyEvent(
                    user_id=user_id,
                    word_id=word_id,
                    page_id=session.page_id,
                    session_id=session.id,
                    event_type="undo_page_completion",
                    created_at=undone_at,
                    delta={"study_count": -session.study_count_increment},
                )
            )
        session.undone_at = undone_at
        page = self.db.get(StudyPage, session.page_id)
        if page is not None:
            page.status = "in_progress"
            page.completed_at = None
        log_operation(
            self.db,
            user_id=user_id,
            operation="study_page_undo_completion",
            object_type="study_session",
            object_id=session.id,
            after={"undone_at": undone_at.isoformat()},
        )
        self.db.commit()
        self.db.refresh(session)
        return session

    def to_read(self, page: StudyPage) -> StudyPageRead:
        words: list[StudyPageWordRead] = []
        for link in self._active_links(page.id):
            word = self.db.get(Word, link.word_id)
            progress = self._progress_for_word(user_id=page.user_id, word_id=word.id)
            words.append(
                StudyPageWordRead(
                    word_id=word.id,
                    word=word.word,
                    meaning=word.meaning,
                    vocabulary_id=word.vocabulary_id,
                    vocabulary_name=word.vocabulary.name,
                    source_page=word.source_page,
                    study_count=progress.study_count,
                    forget_count=progress.forget_count,
                    status=progress.status,
                    display_order=link.display_order,
                    can_mark_mastered=progress.study_count == 0,
                )
            )
        return StudyPageRead(
            id=page.id,
            page_number=page.page_number,
            page_size=page.page_size,
            status=page.status,
            is_short=page.is_short,
            words=words,
        )

    def _candidate_words(self, user_id: int, limit: int, excluded_word_ids: set[int]) -> list[Word]:
        rows = self.db.scalars(
            select(Word)
            .join(Vocabulary)
            .join(WordProgress, WordProgress.word_id == Word.id)
            .where(
                Vocabulary.user_id == user_id,
                Vocabulary.active.is_(True),
                Vocabulary.deleted_at.is_(None),
                WordProgress.user_id == user_id,
                WordProgress.status == "unlearned",
                WordProgress.study_count == 0,
            )
            .order_by(Vocabulary.priority, Vocabulary.id, Word.position)
        )
        selected: list[Word] = []
        for word in rows:
            if word.id in excluded_word_ids:
                continue
            if self._should_skip_cross_vocabulary_word(user_id=user_id, word=word):
                continue
            selected.append(word)
            if len(selected) == limit:
                break
        return selected

    def _should_skip_cross_vocabulary_word(self, user_id: int, word: Word) -> bool:
        duplicate_progress = self.db.scalars(
            select(WordProgress)
            .join(Word)
            .where(
                Word.normalized_word == word.normalized_word,
                Word.vocabulary_id != word.vocabulary_id,
                WordProgress.user_id == user_id,
                WordProgress.study_count >= 3,
                WordProgress.has_forgotten.is_(False),
            )
        )
        return any(True for _ in duplicate_progress)

    def _active_links(self, page_id: int) -> list[StudyPageWord]:
        return list(
            self.db.scalars(
                select(StudyPageWord)
                .where(StudyPageWord.page_id == page_id, StudyPageWord.active.is_(True))
                .order_by(StudyPageWord.display_order, StudyPageWord.id)
            )
        )

    def _require_page(self, page_id: int, user_id: int) -> StudyPage:
        page = self.get_page(page_id=page_id, user_id=user_id)
        if page is None:
            raise ValueError("Study page not found")
        return page

    def _progress_for_word(self, user_id: int, word_id: int) -> WordProgress:
        progress = self.db.scalar(select(WordProgress).where(WordProgress.user_id == user_id, WordProgress.word_id == word_id))
        if progress is None:
            raise ValueError("Word progress not found")
        return progress
