from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SyncRecord, UserSettings, Vocabulary, Word, WordProgress
from app.schemas.sync import SyncEvent, SyncPullResponse, SyncPushResponse, SyncResult, SyncedEvent


class SyncService:
    def __init__(self, db: Session):
        self.db = db

    def push(self, user_id: int, events: list[SyncEvent]) -> SyncPushResponse:
        results: list[SyncResult] = []
        try:
            for event in events:
                existing = self.db.scalar(select(SyncRecord).where(SyncRecord.user_id == user_id, SyncRecord.event_id == event.event_id))
                if existing is not None:
                    results.append(SyncResult(event_id=event.event_id, status="duplicate", conflict=existing.conflict))
                    continue
                status, conflict = self._apply(user_id, event)
                self.db.add(SyncRecord(
                    user_id=user_id,
                    event_id=event.event_id,
                    device_id=event.device_id,
                    client_timestamp=event.client_timestamp,
                    entity_type=event.entity_type,
                    entity_id=event.entity_id,
                    operation=event.operation,
                    changes=event.changes,
                    status=status,
                    conflict=conflict,
                ))
                results.append(SyncResult(event_id=event.event_id, status=status, conflict=conflict))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return SyncPushResponse(results=results)

    def pull(self, user_id: int, cursor: int) -> SyncPullResponse:
        records = list(self.db.scalars(select(SyncRecord).where(SyncRecord.user_id == user_id, SyncRecord.id > cursor).order_by(SyncRecord.id)))
        events = [SyncedEvent(
            cursor=record.id,
            event_id=record.event_id,
            device_id=record.device_id,
            client_timestamp=record.client_timestamp,
            server_timestamp=record.server_timestamp,
            entity_type=record.entity_type,
            entity_id=record.entity_id,
            operation=record.operation,
            changes=record.changes,
            status=record.status,
            conflict=record.conflict,
        ) for record in records]
        return SyncPullResponse(events=events, next_cursor=records[-1].id if records else cursor)

    def _apply(self, user_id: int, event: SyncEvent) -> tuple[str, dict[str, object] | None]:
        if event.entity_type == "word_progress":
            return self._merge_word_progress(user_id, event)
        return self._merge_settings(user_id, event)

    def _merge_word_progress(self, user_id: int, event: SyncEvent) -> tuple[str, dict[str, object] | None]:
        word_id = int(event.entity_id)
        word = self.db.scalar(select(Word).join(Vocabulary).where(Word.id == word_id, Vocabulary.user_id == user_id))
        if word is None:
            raise ValueError("Word is not available for this user")
        progress = self.db.scalar(select(WordProgress).where(WordProgress.user_id == user_id, WordProgress.word_id == word_id))
        if progress is None:
            progress = WordProgress(user_id=user_id, word_id=word_id)
            self.db.add(progress)
            self.db.flush()

        study_delta = self._nonnegative_delta(event.changes, "study_count_delta")
        forget_delta = self._nonnegative_delta(event.changes, "forget_count_delta")
        progress.study_count += study_delta
        progress.forget_count += forget_delta
        if forget_delta:
            progress.has_forgotten = True
            progress.needs_special_attention = True

        conflict = None
        if "status" in event.changes:
            incoming = str(event.changes["status"])
            if incoming not in {"unlearned", "learning", "mastered"}:
                raise ValueError("Unsupported word progress status")
            if progress.updated_at > event.client_timestamp:
                conflict = {"field": "status", "client_value": incoming, "server_value": progress.status}
            else:
                progress.status = incoming
                progress.updated_at = event.client_timestamp
        elif study_delta or forget_delta:
            progress.updated_at = max(progress.updated_at, event.client_timestamp)
        return ("conflict", conflict) if conflict else ("applied", None)

    def _merge_settings(self, user_id: int, event: SyncEvent) -> tuple[str, dict[str, object] | None]:
        settings = self.db.get(UserSettings, user_id)
        if settings is None:
            settings = UserSettings(user_id=user_id)
            self.db.add(settings)
            self.db.flush()
        if settings.updated_at > event.client_timestamp:
            return "conflict", {"field": "settings", "client_value": event.changes, "server_value": self._settings_value(settings)}
        allowed = {"page_size", "intervals", "theme", "font_size"}
        if set(event.changes) - allowed:
            raise ValueError("Unsupported settings field")
        for key, value in event.changes.items():
            setattr(settings, key, value)
        settings.updated_at = event.client_timestamp
        return "applied", None

    @staticmethod
    def _nonnegative_delta(changes: dict[str, object], key: str) -> int:
        value = int(changes.get(key, 0))
        if value < 0:
            raise ValueError(f"{key} must be non-negative")
        return value

    @staticmethod
    def _settings_value(settings: UserSettings) -> dict[str, object]:
        return {"page_size": settings.page_size, "intervals": settings.intervals, "theme": settings.theme, "font_size": settings.font_size}
