from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class StudyPageWordRead(BaseModel):
    word_id: int
    word: str
    meaning: str
    vocabulary_id: int
    vocabulary_name: str
    source_page: str | None
    study_count: int
    forget_count: int
    status: str
    display_order: int
    can_mark_mastered: bool


class StudyPageRead(BaseModel):
    id: int
    page_number: int
    page_size: int
    status: str
    is_short: bool
    words: list[StudyPageWordRead]


class CompletePageRequest(BaseModel):
    completed_at: datetime | None = None


class StudySessionRead(BaseModel):
    id: int
    page_id: int
    completed_at: datetime
    snapshot: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class UndoCompletionRequest(BaseModel):
    session_id: int


class UndoCompletionResponse(BaseModel):
    status: str
