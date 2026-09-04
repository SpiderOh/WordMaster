from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User, UserSettings, Vocabulary
from app.db.session import get_db
from app.schemas.settings import SettingsRead, SettingsUpdate

router = APIRouter(tags=["settings"])


def _get_or_create_settings(db: Session, user_id: int) -> UserSettings:
    settings = db.get(UserSettings, user_id)
    if settings is None:
        settings = UserSettings(user_id=user_id, page_size=15, intervals=[0, 1, 4], theme="system", font_size="medium")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _to_read(db: Session, settings: UserSettings) -> SettingsRead:
    priorities = {
        vocabulary.id: vocabulary.priority
        for vocabulary in db.scalars(
            select(Vocabulary).where(
                Vocabulary.user_id == settings.user_id,
                Vocabulary.deleted_at.is_(None),
            )
        )
    }
    return SettingsRead(
        page_size=settings.page_size,
        intervals=settings.intervals,
        theme=settings.theme,
        font_size=settings.font_size,
        vocabulary_priorities=priorities,
    )


@router.get("", response_model=SettingsRead)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsRead:
    return _to_read(db, _get_or_create_settings(db, current_user.id))


@router.put("", response_model=SettingsRead)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SettingsRead:
    settings = _get_or_create_settings(db, current_user.id)
    vocabularies = list(
        db.scalars(
            select(Vocabulary).where(
                Vocabulary.user_id == current_user.id,
                Vocabulary.id.in_(payload.vocabulary_priorities),
                Vocabulary.deleted_at.is_(None),
            )
        )
    )
    if len(vocabularies) != len(payload.vocabulary_priorities):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vocabulary priority contains an unknown ID")
    settings.page_size = payload.page_size
    settings.intervals = payload.intervals
    settings.theme = payload.theme
    settings.font_size = payload.font_size
    for vocabulary in vocabularies:
        vocabulary.priority = payload.vocabulary_priorities[vocabulary.id]
    db.commit()
    db.refresh(settings)
    return _to_read(db, settings)
