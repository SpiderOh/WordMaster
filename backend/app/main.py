from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.security import hash_password
from app.db.models import User
from app.db.session import SessionLocal, init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    if settings.auth_mode == "server":
        if not settings.server_username or not settings.server_password:
            raise RuntimeError("WORDMASTER_SERVER_USERNAME and WORDMASTER_SERVER_PASSWORD are required in server mode")
        with SessionLocal() as db:
            user = db.query(User).filter(User.username == settings.server_username).first()
            if user is None:
                db.add(User(username=settings.server_username, password_hash=hash_password(settings.server_password)))
                db.commit()
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
