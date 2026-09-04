from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SyncEvent(BaseModel):
    event_id: str = Field(min_length=1, max_length=120)
    device_id: str = Field(min_length=1, max_length=120)
    client_timestamp: datetime
    entity_type: Literal["word_progress", "user_settings"]
    entity_id: str = Field(min_length=1, max_length=120)
    operation: str = Field(min_length=1, max_length=80)
    changes: dict[str, object]


class SyncPushRequest(BaseModel):
    events: list[SyncEvent] = Field(max_length=500)


class SyncResult(BaseModel):
    event_id: str
    status: Literal["applied", "duplicate", "conflict"]
    conflict: dict[str, object] | None = None


class SyncPushResponse(BaseModel):
    results: list[SyncResult]


class SyncedEvent(SyncEvent):
    cursor: int
    server_timestamp: datetime
    status: str
    conflict: dict[str, object] | None = None


class SyncPullResponse(BaseModel):
    events: list[SyncedEvent]
    next_cursor: int
