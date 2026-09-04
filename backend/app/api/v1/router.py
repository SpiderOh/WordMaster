from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.history import router as history_router
from app.api.v1.study_pages import router as study_pages_router
from app.api.v1.vocabularies import router as vocabularies_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(history_router, prefix="/history")
api_router.include_router(vocabularies_router, prefix="/vocabularies")
api_router.include_router(study_pages_router, prefix="/study-pages")
