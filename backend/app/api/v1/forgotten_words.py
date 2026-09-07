from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.forgotten_words import (
    CompleteSpecialPageRequest,
    CreateSpecialPageRequest,
    ForgottenWordRead,
    WordProgressRead,
)
from app.schemas.study_pages import StudyPageRead, StudySessionRead
from app.services.forgetting_service import ForgettingNotFoundError, ForgettingService
from app.services.study_page_service import StudyPageService

router = APIRouter(tags=["forgotten-words"])


@router.get("", response_model=list[ForgottenWordRead])
def list_forgotten_words(
    search: str | None = Query(default=None),
    vocabulary_id: int | None = Query(default=None),
    word_status: str | None = Query(default=None, alias="status"),
    forgotten_since: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ForgottenWordRead]:
    items = ForgettingService(db).list_forgotten(
        user_id=current_user.id,
        search=search,
        vocabulary_id=vocabulary_id,
        status=word_status,
        forgotten_since=forgotten_since,
    )
    return [ForgottenWordRead.model_validate(item) for item in items]


@router.get("/export")
def export_forgotten_words(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    content = ForgettingService(db).export_forgotten_csv(user_id=current_user.id)
    return Response(
        content=f"\ufeff{content}",
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="forgotten-words.csv"'},
    )


@router.post("/special-page", response_model=StudyPageRead, status_code=status.HTTP_201_CREATED)
def create_special_page(
    payload: CreateSpecialPageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudyPageRead:
    try:
        page = ForgettingService(db).create_special_page(user_id=current_user.id, word_ids=payload.word_ids)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return StudyPageService(db).to_read(page)


@router.post(
    "/special-pages/{page_id}/complete",
    response_model=StudySessionRead,
    status_code=status.HTTP_201_CREATED,
)
def complete_special_page(
    page_id: int,
    payload: CompleteSpecialPageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudySessionRead:
    try:
        session = ForgettingService(db).complete_special_page(
            user_id=current_user.id,
            page_id=page_id,
            outcomes=payload.outcomes,
            completed_at=payload.completed_at,
        )
    except ForgettingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return StudySessionRead.model_validate(session)


@router.post("/{word_id}/restore", response_model=WordProgressRead)
def restore_mastered_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WordProgressRead:
    try:
        progress = ForgettingService(db).restore_mastered(user_id=current_user.id, word_id=word_id)
    except ForgettingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return WordProgressRead.model_validate(progress)


@router.post("/{word_id}/undo", response_model=WordProgressRead)
def undo_forgetting(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WordProgressRead:
    try:
        progress = ForgettingService(db).undo_last_forgetting(user_id=current_user.id, word_id=word_id)
    except ForgettingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return WordProgressRead.model_validate(progress)
