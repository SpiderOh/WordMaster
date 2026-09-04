from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VocabularyRead(BaseModel):
    id: int
    name: str
    filename: str
    imported_at: datetime
    total_words: int
    active: bool
    priority: int

    model_config = ConfigDict(from_attributes=True)


class RowErrorRead(BaseModel):
    row_number: int
    code: str
    message: str


class ImportResponse(BaseModel):
    vocabulary: VocabularyRead
    imported_count: int
    row_errors: list[RowErrorRead]


class VocabularyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)


class VocabularyActiveUpdate(BaseModel):
    active: bool


class VocabularyPriorityUpdate(BaseModel):
    priority: int = Field(ge=0, le=10_000)
