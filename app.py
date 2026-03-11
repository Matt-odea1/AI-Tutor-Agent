# src/app.py
from __future__ import annotations

from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(filename=".env", usecwd=True), override=False)

from src.main.config import get_settings
from src.main.controllers.api_errors import register_exception_handlers
from src.main.controllers.InternalEndpoints import router as context_router, s3_router
from src.main.controllers.chat_router import chat_router
from src.main.controllers.analytics_router import analytics_router
from src.main.controllers.auth_router import auth_router
from src.main.controllers.history_router import history_router
from src.main.controllers.questions_router import questions_router
from src.main.controllers.evaluations_router import evaluations_router
from src.main.controllers.student_router import student_router
from src.main.controllers.assessment_router import assessment_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_title,
        version=settings.app_version,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
    )

    # CORS Configuration
    # Default: Allow all localhost addresses for development
    origins_env = settings.allow_origins_raw
    
    if origins_env == "http://localhost:*":
        # Allow all localhost ports for development
        origins: List[str] = settings.allow_origins  # Allow all origins in dev (will be filtered by credentials)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    elif origins_env:
        # Production: Use specific origins from env variable
        origins: List[str] = settings.allow_origins
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.get("/health", tags=["meta"])
    def health():
        return {"status": "ok"}

    register_exception_handlers(app)

    app.include_router(context_router)
    app.include_router(chat_router)
    app.include_router(analytics_router)
    app.include_router(history_router)
    app.include_router(questions_router)
    app.include_router(evaluations_router)
    app.include_router(student_router)
    app.include_router(assessment_router)
    app.include_router(s3_router)
    app.include_router(auth_router)

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    host = settings.host
    port = settings.port
    reload = settings.reload
    uvicorn.run("app:app", host=host, port=port, reload=reload)
