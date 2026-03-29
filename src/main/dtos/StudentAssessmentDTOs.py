"""
DTOs for Student Assessment endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# --- Request Models ---

class SubmitAnswerRequest(BaseModel):
    """Request to submit an answer (audio, text, or video) for a question"""
    question_id: str = Field(..., description="Question identifier")
    assessment_id: str = Field(..., description="Assessment identifier")
    answer_type: str = Field("audio", description="'audio', 'text', or 'video'")
    # Audio answer fields
    audio_url: Optional[str] = Field(None, description="S3 URL of uploaded audio file (audio answers)")
    duration: Optional[int] = Field(None, description="Recording duration in seconds", ge=0)
    # Text answer fields
    text_content: Optional[str] = Field(None, description="Written answer text (text answers)", min_length=1)
    # Video answer fields
    video_url: Optional[str] = Field(None, description="S3 URL of uploaded video file (video answers)")


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
    timeLimit: Optional[int] = None
    createdAt: str


class StudentQuestionsResponse(BaseModel):
    """Response with list of questions for a student"""
    ok: bool = True
    studentId: str
    assessmentId: str
    questions: List[QuestionResponse]
    totalQuestions: int
    answerMode: str = "oral"
    preparationTime: Optional[int] = None
    assessmentTitle: Optional[str] = None
    assessmentCourse: Optional[str] = None
    assessmentDescription: Optional[str] = None


class SubmitAnswerResponse(BaseModel):
    """Response after submitting an answer"""
    ok: bool = True
    studentId: str
    questionId: str
    answerType: str = "audio"
    audioUrl: Optional[str] = None
    duration: Optional[int] = None
    textContent: Optional[str] = None
    videoUrl: Optional[str] = None
    submittedAt: str
    assessmentId: str


class SubmitProctorChunkRequest(BaseModel):
    """Request to log a proctoring chunk manifest entry"""
    assessment_id: str = Field(..., description="Assessment identifier")
    chunk_url: str = Field(..., description="S3 URL of the proctoring chunk")
    chunk_index: int = Field(..., description="Zero-based chunk sequence number", ge=0)
    timestamp: Optional[str] = Field(None, description="ISO timestamp when the chunk was captured")


class SubmitProctorChunkResponse(BaseModel):
    """Response after storing a proctoring chunk manifest entry"""
    ok: bool = True
    studentId: str
    assessmentId: str
    chunkIndex: int


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
    questionNumber: Optional[int] = None
    questionText: str
    questionType: Optional[str] = None
    audioUrl: Optional[str] = None
    transcript: Optional[str] = None
    duration: Optional[int] = None
    totalScore: Optional[int] = None
    correctnessScore: Optional[int] = None
    understandingScore: Optional[int] = None
    maxScore: Optional[int] = None
    feedback: Optional[str] = None
    strengths: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None
    suggestedImprovements: Optional[List[str]] = None
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
