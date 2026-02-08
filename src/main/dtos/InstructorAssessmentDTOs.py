"""
DTOs for Instructor Assessment endpoints
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# --- Request Models ---

class CreateAssessmentRequest(BaseModel):
    """Request to create a new assessment"""
    title: str = Field(..., description="Assessment title")
    course: str = Field(..., description="Course name/code")
    description: str = Field(default="", description="Assessment description")
    dueDate: str = Field(..., description="Due date (ISO format)")
    totalQuestions: int = Field(..., description="Number of questions to generate", ge=1, le=20)
    timeLimit: Optional[int] = Field(None, description="Time limit per question in minutes", ge=1, le=30)


class UploadedStudent(BaseModel):
    """Student data for bulk upload"""
    name: str
    email: str
    studentId: str
    code: str
    assignmentFile: Optional[str] = None


class UploadStudentsRequest(BaseModel):
    """Request to upload students to an assessment"""
    students: List[UploadedStudent] = Field(..., description="List of students to enroll")


class GenerateQuestionsBatchRequest(BaseModel):
    """Request to start batch question generation"""
    studentIds: Optional[List[str]] = Field(None, description="Specific student IDs (or all if empty)")


class EvaluateBatchRequest(BaseModel):
    """Request to start batch evaluation"""
    studentIds: Optional[List[str]] = Field(None, description="Specific student IDs (or all if empty)")


# --- Response Models ---

class AssessmentResponse(BaseModel):
    """Assessment data response"""
    id: str
    title: str
    course: str
    description: str
    dueDate: str
    totalQuestions: int
    timeLimit: Optional[int] = None
    status: str
    createdAt: str
    updatedAt: str


class AssessmentListResponse(BaseModel):
    """Response with list of assessments"""
    ok: bool = True
    assessments: List[AssessmentResponse]
    total: int


class StudentResponse(BaseModel):
    """Student enrollment data"""
    studentId: str
    name: str
    email: str
    code: str
    assignmentFile: str
    status: str
    enrolledAt: str


class StudentListResponse(BaseModel):
    """Response with list of students"""
    ok: bool = True
    assessmentId: str
    students: List[StudentResponse]
    total: int


class StudentProgressItem(BaseModel):
    """Individual student progress"""
    studentId: str
    name: str
    email: str
    status: str
    totalQuestions: int
    answeredQuestions: int
    percentage: float
    startedAt: Optional[str] = None
    submittedAt: Optional[str] = None


class ProgressSummaryResponse(BaseModel):
    """Response with progress for all students"""
    ok: bool = True
    assessmentId: str
    students: List[StudentProgressItem]
    summary: dict  # Stats: total, not-started, in-progress, completed


class StudentResultItem(BaseModel):
    """Individual student result"""
    studentId: str
    name: str
    email: str
    totalScore: int
    maxScore: int
    percentage: float
    grade: str
    completedAt: Optional[str] = None


class ResultsSummaryResponse(BaseModel):
    """Response with results for all students"""
    ok: bool = True
    assessmentId: str
    results: List[StudentResultItem]
    summary: dict  # Stats: avg score, grade distribution


class QuestionGenerationJobResponse(BaseModel):
    """Response after starting question generation"""
    ok: bool = True
    jobId: str
    assessmentId: str
    status: str  # pending, running, completed, failed
    totalStudents: int
    processedCount: int
    message: str


class QuestionGenerationStatusResponse(BaseModel):
    """Response for generation job status check"""
    jobId: str
    assessmentId: str
    status: str
    totalStudents: int
    processedCount: int
    startedAt: str
    completedAt: Optional[str] = None
    error: Optional[str] = None


class EvaluationJobResponse(BaseModel):
    """Response after starting evaluation"""
    ok: bool = True
    jobId: str
    assessmentId: str
    status: str
    totalStudents: int
    processedCount: int
    message: str


class EvaluationStatusResponse(BaseModel):
    """Response for evaluation job status check"""
    jobId: str
    assessmentId: str
    status: str
    totalStudents: int
    processedCount: int
    startedAt: str
    completedAt: Optional[str] = None
    error: Optional[str] = None
