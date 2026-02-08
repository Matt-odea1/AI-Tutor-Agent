"""
DTOs for Student Assessment endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# --- Request Models ---

class SubmitAnswerRequest(BaseModel):
    """Request to submit an audio answer for a question"""
    question_id: str = Field(..., description="Question identifier")
    audio_url: str = Field(..., description="S3 URL of uploaded audio file")
    duration: int = Field(..., description="Recording duration in seconds", ge=0)


class SubmitAssessmentRequest(BaseModel):
    """Request to mark assessment as complete"""
    assessment_id: str = Field(..., description="Assessment identifier")


# --- Response Models ---

class QuestionResponse(BaseModel):
    """Individual question data"""
    id: str
    text: str
    codeContext: Optional[str] = None
    assessmentId: str
    studentId: str
    difficulty: Optional[str] = None
    topic: Optional[str] = None
    createdAt: str


class StudentQuestionsResponse(BaseModel):
    """Response with list of questions for a student"""
    ok: bool = True
    studentId: str
    assessmentId: str
    questions: List[QuestionResponse]
    totalQuestions: int


class SubmitAnswerResponse(BaseModel):
    """Response after submitting an answer"""
    ok: bool = True
    studentId: str
    questionId: str
    audioUrl: str
    duration: int
    submittedAt: str
    assessmentId: str


class SubmitAssessmentResponse(BaseModel):
    """Response after submitting complete assessment"""
    ok: bool = True
    studentId: str
    assessmentId: str
    status: str
    submittedAt: str
    assessmentTitle: str
    questionsAnswered: int
    totalQuestions: int


class StudentProgressResponse(BaseModel):
    """Response with student progress data"""
    studentId: str
    studentName: str
    studentEmail: str
    assessmentId: str
    assessmentTitle: str
    status: str
    totalQuestions: int
    answeredQuestions: int
    percentage: float
    startedAt: Optional[str] = None
    submittedAt: Optional[str] = None


class QuestionResultDetail(BaseModel):
    """Detailed result for a single question"""
    questionId: str
    questionText: str
    audioUrl: Optional[str] = None
    duration: Optional[int] = None
    score: Optional[int] = None
    maxScore: Optional[int] = None
    feedback: Optional[str] = None
    strengths: Optional[str] = None
    improvements: Optional[str] = None
    evaluatedAt: Optional[str] = None


class StudentResultsResponse(BaseModel):
    """Response with complete evaluation results"""
    studentId: str
    studentName: str
    studentEmail: str
    assessmentId: str
    assessmentTitle: str
    status: str
    totalScore: int
    maxScore: int
    percentage: float
    grade: str  # Excellent, Competent, Developing, Unsatisfactory
    submittedAt: Optional[str] = None
    evaluatedQuestions: int
    totalQuestions: int
    questions: List[QuestionResultDetail]
