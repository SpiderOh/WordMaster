from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import StudySession, Word, WordProgress, WordStudyEvent


@dataclass(frozen=True)
class RepeatedForgettingWord:
    word_id: int
    word: str
    forget_count_today: int
    total_forget_count: int


@dataclass(frozen=True)
class TodayStats:
    date: date
    study_word_count: int
    forgetting_count: int
    repeated_forgetting_count: int
    streak_days: int
    total_study_count: int
    learning_word_count: int
    mastered_word_count: int
    forgotten_word_count: int
    repeated_forgetting_words: list[RepeatedForgettingWord]


class StatsService:
    def __init__(self, db: Session):
        self.db = db

    def today(self, user_id: int, today: date) -> TodayStats:
        events = list(
            self.db.scalars(
                select(WordStudyEvent)
                .where(WordStudyEvent.user_id == user_id)
                .order_by(WordStudyEvent.created_at, WordStudyEvent.id)
            )
        )
        undone_forgetting_ids = {
            int(event.delta["target_event_id"])
            for event in events
            if event.event_type == "undo_forgetting" and event.delta and "target_event_id" in event.delta
        }
        today_events = [event for event in events if event.created_at.date() == today]
        all_active_forgetting_events = [
            event
            for event in events
            if event.event_type == "mark_forgotten" and event.id not in undone_forgetting_ids
        ]
        active_forgetting_events = [
            event
            for event in today_events
            if event.event_type == "mark_forgotten" and event.id not in undone_forgetting_ids
        ]
        studied_word_ids = {
            event.word_id
            for event in today_events
            if event.event_type in {"study_completed", "special_remembered", "special_mastered"}
            or (event.event_type == "mark_forgotten" and event.id not in undone_forgetting_ids)
        }
        forgetting_by_word = Counter(event.word_id for event in active_forgetting_events)
        all_forgetting_by_word = Counter(event.word_id for event in all_active_forgetting_events)
        repeated_words: list[RepeatedForgettingWord] = []
        for word_id, count in forgetting_by_word.items():
            if count < 2 and all_forgetting_by_word[word_id] == count:
                continue
            word = self.db.get(Word, word_id)
            progress = self.db.scalar(
                select(WordProgress).where(WordProgress.user_id == user_id, WordProgress.word_id == word_id)
            )
            repeated_words.append(
                RepeatedForgettingWord(
                    word_id=word_id,
                    word=word.word,
                    forget_count_today=count,
                    total_forget_count=progress.forget_count,
                )
            )
        repeated_words.sort(key=lambda item: (-item.forget_count_today, item.word.casefold(), item.word_id))

        session_dates = {
            session.completed_at.date()
            for session in self.db.scalars(
                select(StudySession).where(StudySession.user_id == user_id, StudySession.undone_at.is_(None))
            )
        }
        streak_days = 0
        cursor = today
        while cursor in session_dates:
            streak_days += 1
            cursor -= timedelta(days=1)

        total_study_count = self.db.scalar(
            select(func.coalesce(func.sum(WordProgress.study_count), 0)).where(WordProgress.user_id == user_id)
        )
        learning_word_count = self.db.scalar(
            select(func.count()).select_from(WordProgress).where(
                WordProgress.user_id == user_id, WordProgress.status == "learning"
            )
        )
        mastered_word_count = self.db.scalar(
            select(func.count()).select_from(WordProgress).where(
                WordProgress.user_id == user_id, WordProgress.status == "mastered"
            )
        )
        forgotten_word_count = self.db.scalar(
            select(func.count()).select_from(WordProgress).where(
                WordProgress.user_id == user_id, WordProgress.forget_count > 0
            )
        )
        return TodayStats(
            date=today,
            study_word_count=len(studied_word_ids),
            forgetting_count=len(active_forgetting_events),
            repeated_forgetting_count=len(repeated_words),
            streak_days=streak_days,
            total_study_count=int(total_study_count or 0),
            learning_word_count=int(learning_word_count or 0),
            mastered_word_count=int(mastered_word_count or 0),
            forgotten_word_count=int(forgotten_word_count or 0),
            repeated_forgetting_words=repeated_words,
        )
