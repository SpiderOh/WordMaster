from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import TokenError, create_access_token, decode_access_token, verify_password
from app.db.models import AuthToken, User
from app.db.session import get_db
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if settings.auth_mode != "server":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Login is disabled in local mode")
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token, record = create_access_token(user.id)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()
    return TokenResponse(access_token=token, expires_in=settings.access_token_minutes * 60)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> Response:
    token = _bearer_token(authorization)
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    record = db.scalar(select(AuthToken).where(AuthToken.token_id == str(payload["jti"]), AuthToken.user_id == int(payload["sub"])))
    if record is None or record.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    record.revoked = True
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return authorization[7:]
