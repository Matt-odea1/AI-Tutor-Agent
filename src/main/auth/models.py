from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(slots=True)
class AuthPrincipal:
    user_id: str
    email: Optional[str] = None
    roles: List[str] = field(default_factory=list)
    source: str = "unknown"
    assessment_id: Optional[str] = None
