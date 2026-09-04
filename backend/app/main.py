from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.security import hash_password
from app.db.models import User
from app.db.session import SessionLocal, init_db
from app.services.default_vocabulary import ensure_default_vocabulary
from pathlib import Path


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    with SessionLocal() as db:
        if settings.auth_mode == "server":
            if not settings.server_username or not settings.server_password:
                raise RuntimeError("WORDMASTER_SERVER_USERNAME and WORDMASTER_SERVER_PASSWORD are required in server mode")
            user = db.query(User).filter(User.username == settings.server_username).first()
            if user is None:
                user = User(username=settings.server_username, password_hash=hash_password(settings.server_password))
                db.add(user)
                db.commit()
                db.refresh(user)
        else:
            user = db.get(User, 1)
            if user is None:
                user = User(id=1, username="local")
                db.add(user)
                db.commit()
                db.refresh(user)
        default_path = Path(settings.default_vocabulary_path) if settings.default_vocabulary_path else Path(__file__).resolve().parents[2] / "data" / "reden_vocabulary_6550.csv"
        ensure_default_vocabulary(db, default_path, user_id=user.id)
    yield


def create_app() -> FastAPI:
    application = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
