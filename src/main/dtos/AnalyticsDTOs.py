from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AnalyticsEventRequest(BaseModel):
    event_name: str = Field(..., min_length=2, max_length=80)
    occurred_at: Optional[str] = Field(None, max_length=64)
    session_id: Optional[str] = Field(None, max_length=128)
    app_mode: Optional[str] = Field(None, max_length=32)
    properties: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsBatchRequest(BaseModel):
    events: List[AnalyticsEventRequest] = Field(default_factory=list, max_length=100)
    sent_at: Optional[str] = Field(None, max_length=64)


class AnalyticsBatchResponse(BaseModel):
    accepted: int


class AnalyticsSummaryResponse(BaseModel):
    window_days: int
    total_events: int
    active_users: int
    event_counts: Dict[str, int]
