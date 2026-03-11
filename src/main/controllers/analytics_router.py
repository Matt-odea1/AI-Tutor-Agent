from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, Header

from src.main.controllers.controller_dependencies import get_analytics_service
from src.main.dtos.AnalyticsDTOs import (
    AnalyticsBatchRequest,
    AnalyticsBatchResponse,
    AnalyticsSummaryResponse,
)
from src.main.auth.dependencies import require_user_id
from src.main.service.AnalyticsService import AnalyticsService


analytics_router = APIRouter(prefix="/internal/analytics", tags=["analytics"])


@analytics_router.post("/events/batch", response_model=AnalyticsBatchResponse)
def ingest_analytics_events(
    request: AnalyticsBatchRequest = Body(...),
    user_id: str = Depends(require_user_id),
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
):
    accepted = analytics_service.ingest_events(
        user_id=user_id,
        events=[event.model_dump() for event in request.events],
        user_agent=user_agent,
    )
    return AnalyticsBatchResponse(accepted=accepted)


@analytics_router.get("/summary", response_model=AnalyticsSummaryResponse)
def analytics_summary(
    window_days: int = 7,
    _: str = Depends(require_user_id),
    analytics_service: AnalyticsService = Depends(get_analytics_service),
):
    return AnalyticsSummaryResponse(**analytics_service.summarize(window_days=window_days))
