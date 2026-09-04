from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.study_pages import (
    CompletePageRequest,
    StudyPageRead,
    StudySessionRead,
    UndoCompletionRequest,
    UndoCompletionResponse,
)
from app.services.study_page_service import NoEligibleWordsError, StudyPageNotFoundError, StudyPageService

router = APIRouter(tags=["study-pages"])


@router.get("/next", response_model=StudyPageRead)
def get_next_page(
    page_size: int = Query(default=15, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudyPageRead:
    service = StudyPageService(db)
    try:
        page = service.get_or_create_next_page(user_id=current_user.id, page_size=page_size)
    except NoEligibleWordsError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return service.to_read(page)


@router.get("/{page_id}", response_model=StudyPageRead)
def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudyPageRead:
    service = StudyPageService(db)
    page = service.get_page(page_id=page_id, user_id=current_user.id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study page not found")
    return service.to_read(page)


@router.post("/{page_id}/words/{word_id}/master", response_model=StudyPageRead)
def mark_word_mastered(
    page_id: int,
    word_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudyPageRead:
    service = StudyPageService(db)
    try:
        page = service.replace_mastered_word(page_id=page_id, word_id=word_id, user_id=current_user.id)
    except StudyPageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return service.to_read(page)


@router.post("/{page_id}/complete", response_model=StudySessionRead, status_code=status.HTTP_201_CREATED)
def complete_page(
    page_id: int,
    payload: CompletePageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudySessionRead:
    completed_at = payload.completed_at or datetime.now(timezone.utc)
    service = StudyPageService(db)
    try:
        session = service.complete_page(page_id=page_id, completed_at=completed_at, user_id=current_user.id)
    except StudyPageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return StudySessionRead.model_validate(session)


@router.post("/{page_id}/undo-complete", response_model=UndoCompletionResponse)
def undo_complete(
    page_id: int,
    payload: UndoCompletionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UndoCompletionResponse:
    service = StudyPageService(db)
    try:
        service.undo_completion(session_id=payload.session_id, page_id=page_id, user_id=current_user.id)
    except StudyPageNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UndoCompletionResponse(status="undone")
