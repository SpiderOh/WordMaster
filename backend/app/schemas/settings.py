from typing import Literal

from pydantic import BaseModel, Field, field_validator


class SettingsUpdate(BaseModel):
    page_size: int = Field(ge=1, le=100)
    intervals: list[int] = Field(min_length=1)
    theme: Literal["system", "light", "dark"]
    font_size: Literal["small", "medium", "large"]
    vocabulary_priorities: dict[int, int] = Field(default_factory=dict)

    @field_validator("intervals")
    @classmethod
    def validate_intervals(cls, value: list[int]) -> list[int]:
        if any(interval < 0 for interval in value):
            raise ValueError("Intervals must be non-negative")
        return list(dict.fromkeys(value))


class SettingsRead(SettingsUpdate):
    pass
