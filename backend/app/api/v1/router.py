from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.backup import router as backup_router
from app.api.v1.health import router as health_router
from app.api.v1.forgotten_words import router as forgotten_words_router
from app.api.v1.history import router as history_router
from app.api.v1.settings import router as settings_router
from app.api.v1.stats import router as stats_router
from app.api.v1.study_pages import router as study_pages_router
from app.api.v1.sync import router as sync_router
from app.api.v1.vocabularies import router as vocabularies_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(backup_router, prefix="/backup")
api_router.include_router(health_router)
api_router.include_router(forgotten_words_router, prefix="/forgotten-words")
api_router.include_router(history_router, prefix="/history")
api_router.include_router(settings_router, prefix="/settings")
api_router.include_router(stats_router, prefix="/stats")
api_router.include_router(vocabularies_router, prefix="/vocabularies")
api_router.include_router(study_pages_router, prefix="/study-pages")
api_router.include_router(sync_router, prefix="/sync")
