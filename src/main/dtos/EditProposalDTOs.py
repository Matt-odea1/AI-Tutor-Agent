from typing import Optional, Dict, Any
from pydantic import BaseModel


class EditProposalRequest(BaseModel):
    query: str
    thread_id: Optional[str] = None
    editor_code: Optional[str] = None
    editor_selection: Optional[str] = None
    last_stdout: Optional[str] = None
    last_error: Optional[str] = None
    language: Optional[str] = None
    buffer_hash: Optional[str] = None
    include_history: bool = False
    pedagogy_mode: Optional[str] = None


class EditProposalResponse(BaseModel):
    answer: str
    edit_block: Optional[Dict[str, Any]] = None
    buffer_hash: Optional[str] = None
