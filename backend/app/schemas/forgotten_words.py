from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ForgetWordRequest(BaseModel):
    session_id: int | None = None


class WordProgressRead(BaseModel):
    word_id: int
    status: str
    study_count: int
    forget_count: int
    has_forgotten: bool
    needs_special_attention: bool

    model_config = ConfigDict(from_attributes=True)


class ForgottenWordRead(BaseModel):
    word_id: int
    word: str
    meaning: str
    vocabulary_id: int
    vocabulary_name: str
    status: str
    study_count: int
    forget_count: int
    last_forgotten_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class CreateSpecialPageRequest(BaseModel):
    word_ids: list[int]


class CompleteSpecialPageRequest(BaseModel):
    outcomes: dict[int, Literal["remembered", "forgotten", "mastered"]]
    completed_at: datetime
