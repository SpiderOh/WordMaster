from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.services.backup_service import BackupService, BackupValidationError

router = APIRouter(tags=["backup"])


@router.get("/json")
def export_json_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return BackupService(db).export_json(user_id=current_user.id)


@router.post("/json")
def import_json_backup(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    try:
        BackupService(db).import_json(user_id=current_user.id, payload=payload)
    except BackupValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"status": "restored"}
