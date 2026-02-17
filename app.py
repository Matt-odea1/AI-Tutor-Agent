# src/app.py
from __future__ import annotations

import logging
import os
import traceback
from typing import List
from urllib.request import Request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv, find_dotenv
from starlette.responses import JSONResponse

load_dotenv(find_dotenv(filename=".env", usecwd=True), override=False)

from src.main.controllers.InternalEndpoints import router as context_router, chat_router, history_router, questions_router, evaluations_router, student_router, assessment_router, s3_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=os.getenv("AI_TUTOR", "Context API"),
        version=os.getenv("APP_VERSION", "0.1.0"),
        docs_url=os.getenv("DOCS_URL", "/docs"),
        redoc_url=os.getenv("REDOC_URL", "/redoc"),
        openapi_url=os.getenv("OPENAPI_URL", "/openapi.json"),
    )

    # CORS Configuration
    # Default: Allow all localhost addresses for development
    origins_env = os.getenv("ALLOW_ORIGINS", "http://localhost:*")
    
    if origins_env == "http://localhost:*":
        # Allow all localhost ports for development
        origins: List[str] = ["*"]  # Allow all origins in dev (will be filtered by credentials)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    elif origins_env:
        # Production: Use specific origins from env variable
        origins: List[str] = [o.strip() for o in origins_env.split(",") if o.strip()]
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

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception):
        logging.exception("Unhandled error on %s %s", request.method, request.url.path)
        detail = {"ok": False, "error": str(exc)}
        if logging.DEBUG:
            detail["trace"] = traceback.format_exc()
        return JSONResponse(status_code=500, content=detail)

    app.include_router(context_router)
    app.include_router(chat_router)
    app.include_router(history_router)
    app.include_router(questions_router)
    app.include_router(evaluations_router)
    app.include_router(student_router)
    app.include_router(assessment_router)
    app.include_router(s3_router)

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    uvicorn.run("app:app", host=host, port=port, reload=reload)
