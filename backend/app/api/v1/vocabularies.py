import csv
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, Vocabulary, Word
from app.db.session import get_db
from app.schemas.vocabularies import (
    ImportResponse,
    VocabularyActiveUpdate,
    VocabularyPriorityUpdate,
    VocabularyRead,
    VocabularyUpdate,
)
from app.services.audit import log_operation
from app.services.vocabulary_import import VocabularyImportService

router = APIRouter(tags=["vocabularies"])


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.get(User, 1)
    if user is None:
        user = User(id=1, username="local")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_vocabulary_or_404(db: Session, vocabulary_id: int, user_id: int) -> Vocabulary:
    vocabulary = db.get(Vocabulary, vocabulary_id)
    if vocabulary is None or vocabulary.user_id != user_id or vocabulary.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vocabulary not found")
    return vocabulary


@router.post("/import", response_model=ImportResponse, status_code=status.HTTP_201_CREATED)
async def import_vocabulary(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportResponse:
    raw_content = await file.read()
    text = raw_content.decode("utf-8-sig")
    service = VocabularyImportService(db)
    try:
        result = service.import_csv(
            io.StringIO(text),
            name=name,
            user_id=current_user.id,
            filename=file.filename or "uploaded.csv",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ImportResponse.model_validate(result.to_dict())


@router.get("", response_model=list[VocabularyRead])
def list_vocabularies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Vocabulary]:
    return list(
        db.scalars(
            select(Vocabulary)
            .where(Vocabulary.user_id == current_user.id, Vocabulary.deleted_at.is_(None))
            .order_by(Vocabulary.priority, Vocabulary.id)
        )
    )


@router.get("/{vocabulary_id}", response_model=VocabularyRead)
def get_vocabulary(
    vocabulary_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Vocabulary:
    return get_vocabulary_or_404(db, vocabulary_id, current_user.id)


@router.get("/{vocabulary_id}/export")
def export_vocabulary(
    vocabulary_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    vocabulary = get_vocabulary_or_404(db, vocabulary_id, current_user.id)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["number", "word", "meaning", "source_page"])
    for word in db.scalars(select(Word).where(Word.vocabulary_id == vocabulary.id).order_by(Word.position, Word.id)):
        writer.writerow([word.original_number or "", word.word, word.meaning, word.source_page or ""])
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="vocabulary-{vocabulary.id}.csv"'},
    )


@router.patch("/{vocabulary_id}", response_model=VocabularyRead)
def update_vocabulary(
    vocabulary_id: int,
    payload: VocabularyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Vocabulary:
    vocabulary = get_vocabulary_or_404(db, vocabulary_id, current_user.id)
    if payload.name is not None:
        before = {"name": vocabulary.name}
        vocabulary.name = payload.name.strip()
        log_operation(
            db,
            user_id=current_user.id,
            operation="vocabulary_rename",
            object_type="vocabulary",
            object_id=vocabulary.id,
            before=before,
            after={"name": vocabulary.name},
        )
    db.commit()
    db.refresh(vocabulary)
    return vocabulary


@router.patch("/{vocabulary_id}/active", response_model=VocabularyRead)
def set_vocabulary_active(
    vocabulary_id: int,
    payload: VocabularyActiveUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Vocabulary:
    vocabulary = get_vocabulary_or_404(db, vocabulary_id, current_user.id)
    before = {"active": vocabulary.active}
    vocabulary.active = payload.active
    log_operation(
        db,
        user_id=current_user.id,
        operation="vocabulary_set_active",
        object_type="vocabulary",
        object_id=vocabulary.id,
        before=before,
        after={"active": vocabulary.active},
    )
    db.commit()
    db.refresh(vocabulary)
    return vocabulary


@router.patch("/{vocabulary_id}/priority", response_model=VocabularyRead)
def set_vocabulary_priority(
    vocabulary_id: int,
    payload: VocabularyPriorityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Vocabulary:
    vocabulary = get_vocabulary_or_404(db, vocabulary_id, current_user.id)
    before = {"priority": vocabulary.priority}
    vocabulary.priority = payload.priority
    log_operation(
        db,
        user_id=current_user.id,
        operation="vocabulary_set_priority",
        object_type="vocabulary",
        object_id=vocabulary.id,
        before=before,
        after={"priority": vocabulary.priority},
    )
    db.commit()
    db.refresh(vocabulary)
    return vocabulary


@router.delete("/{vocabulary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vocabulary(
    vocabulary_id: int,
    confirm: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    vocabulary = get_vocabulary_or_404(db, vocabulary_id, current_user.id)
    if confirm != vocabulary.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confirmation name mismatch")
    before = {"name": vocabulary.name, "active": vocabulary.active, "deleted_at": None}
    vocabulary.soft_delete()
    log_operation(
        db,
        user_id=current_user.id,
        operation="vocabulary_delete",
        object_type="vocabulary",
        object_id=vocabulary.id,
        before=before,
        after={"active": vocabulary.active, "deleted_at": vocabulary.deleted_at.isoformat()},
    )
    db.commit()
