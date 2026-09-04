from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.vocabularies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.sync import SyncPullResponse, SyncPushRequest, SyncPushResponse
from app.services.sync_service import SyncService

router = APIRouter(tags=["sync"])


@router.post("/push", response_model=SyncPushResponse)
def push_events(payload: SyncPushRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> SyncPushResponse:
    try:
        return SyncService(db).push(user_id=current_user.id, events=payload.events)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/pull", response_model=SyncPullResponse)
def pull_events(cursor: int = Query(default=0, ge=0), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> SyncPullResponse:
    return SyncService(db).pull(user_id=current_user.id, cursor=cursor)
