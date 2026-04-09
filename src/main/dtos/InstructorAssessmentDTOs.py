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
    timeLimit: Optional[int] = Field(None, description="Time limit per question in minutes (1–30). Stored and served to students as seconds.", ge=1, le=30)
    accessMode: str = Field("open", description="'open' or 'scheduled'")
    scheduledWindowStart: Optional[str] = Field(None, description="ISO datetime for window start (scheduled mode)")
    scheduledWindowEnd: Optional[str] = Field(None, description="ISO datetime for window end (scheduled mode)")
    autoEvaluate: bool = Field(False, description="Automatically trigger evaluation when all students submit")
    rubric: Optional[str] = Field(None, description="Custom grading rubric injected into the evaluation prompt")
    answerMode: str = Field("oral", description="'oral' or 'written' — controls student answer interface")
    preparationTime: Optional[int] = Field(None, description="Seconds of prep time shown before oral recording starts (0 = start immediately)", ge=0, le=300)


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


class UpdateScheduleRequest(BaseModel):
    """Request to update assessment scheduling"""
    accessMode: str = Field(..., description="'open' or 'scheduled'")
    scheduledWindowStart: Optional[str] = Field(None, description="ISO datetime for window start")
    scheduledWindowEnd: Optional[str] = Field(None, description="ISO datetime for window end")


class UpdateBriefRequest(BaseModel):
    """Request to update the assignment brief"""
    brief: str = Field(..., description="Assignment brief text (min 50 characters)", min_length=50)


class UpdateStatusRequest(BaseModel):
    """Request to transition assessment status (draft→open, open→closed)"""
    status: str = Field(..., description="Target status: 'open' or 'closed'")


# --- Response Models ---

class AssessmentResponse(BaseModel):
    """Assessment data response"""
    id: str
    createdBy: Optional[str] = None
    title: str
    course: str
    description: str
    dueDate: str
    totalQuestions: int
    timeLimit: Optional[int] = None
    accessMode: str = "open"
    scheduledWindowStart: Optional[str] = None
    scheduledWindowEnd: Optional[str] = None
    assignmentBrief: Optional[str] = None
    autoEvaluate: bool = False
    rubric: Optional[str] = None
    answerMode: str = "oral"
    preparationTime: Optional[int] = None
    resultsReleased: bool = False
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
    name: str = ""
    email: str = ""
    code: str = ""
    assignmentFile: Optional[str] = ""
    status: str = ""
    enrolledAt: str = ""


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
    failedCount: int = 0
    message: str


class QuestionGenerationStatusResponse(BaseModel):
    """Response for generation job status check"""
    jobId: str
    assessmentId: str
    status: str
    totalStudents: int
    processedCount: int
    failedCount: int = 0
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


# ── Sprint 3: Submission Upload ──────────────────────────────────

class CsvEnrollmentResponse(BaseModel):
    """Response after CSV bulk enrolment"""
    ok: bool = True
    assessmentId: str
    enrolledCount: int
    errorCount: int
    errors: List[dict]  # [{row, data, errors}]


class CodeUploadResponse(BaseModel):
    """Response after single-student code file upload"""
    ok: bool = True
    assessmentId: str
    studentId: str
    filesUploaded: int
    s3Key: str
    codeLength: int


class ZipUploadResponse(BaseModel):
    """Response after zip archive upload"""
    ok: bool = True
    assessmentId: str
    matchedCount: int
    unmatchedCount: int
    matched: List[dict]
    unmatched: List[dict]
    errors: List[dict]


# ── Sprint 4: Question Generation, Bank, Time Limits ─────────────

class BankQuestionRequest(BaseModel):
    """Request to add a bank question"""
    text: str = Field(..., description="Question text (min 10 chars)", min_length=10)
    topic: str = Field("general", description="Topic tag")
    difficulty: str = Field("medium", description="'easy', 'medium', or 'hard'")
    timeLimit: Optional[int] = Field(None, description="Per-question time limit in seconds (overrides assessment default)", ge=1)


class SuggestBankQuestionsRequest(BaseModel):
    """Request to AI-suggest bank questions"""
    count: int = Field(5, description="Number of suggestions to generate", ge=1, le=10)


class BankQuestionResponse(BaseModel):
    """A single bank question"""
    id: str
    assessmentId: str
    text: str
    topic: str
    difficulty: str
    source: str
    timeLimit: Optional[int] = None
    createdAt: str


class BankQuestionListResponse(BaseModel):
    """Response with list of bank questions"""
    ok: bool = True
    assessmentId: str
    questions: List[BankQuestionResponse]
    total: int


class UpdateQuestionTimeLimitRequest(BaseModel):
    """Request to set a per-question time limit override"""
    timeLimit: Optional[int] = Field(None, description="Time limit in seconds; null removes the override", ge=1)


class BankQuestionSuggestion(BaseModel):
    """An AI-suggested bank question — not yet persisted"""
    text: str
    topic: str
    difficulty: str
    source: str = "ai_suggested"


class SuggestBankQuestionsResponse(BaseModel):
    """Response with AI-suggested bank questions"""
    ok: bool = True
    assessmentId: str
    suggestions: List[BankQuestionSuggestion]
    total: int


# ── Sprint 8: Results Dashboards (EPIC-6-1 to 6-4) ───────────────

class ScoreOverrideRequest(BaseModel):
    """Instructor override for a question score"""
    score: int = Field(..., description="Override score (0-10)", ge=0, le=10)
    comment: Optional[str] = Field(None, description="Instructor comment")


class ScoreOverrideResponse(BaseModel):
    """Response after applying a score override"""
    ok: bool = True
    assessmentId: str
    studentId: str
    questionId: str
    instructorScore: int
    comment: Optional[str] = None


class ProctorChunkItem(BaseModel):
    """Single proctoring chunk entry"""
    chunkIndex: int
    chunkUrl: str
    recordedAt: Optional[str] = None


class ProctorChunkHealthResponse(BaseModel):
    """Proctoring chunk manifest for a student"""
    ok: bool = True
    studentId: str
    assessmentId: str
    totalChunks: int
    missingIndexes: List[int]
    chunks: List[ProctorChunkItem]


class InstructorQuestionDetail(BaseModel):
    """Per-question detail in instructor student view"""
    questionId: str
    questionText: str
    answerType: Optional[str] = None
    audioUrl: Optional[str] = None
    videoUrl: Optional[str] = None
    textContent: Optional[str] = None
    duration: Optional[int] = None
    transcript: Optional[str] = None
    transcriptStatus: Optional[str] = None
    aiScore: Optional[int] = None
    instructorScore: Optional[int] = None
    effectiveScore: Optional[int] = None
    maxScore: int = 10
    feedback: Optional[str] = None
    strengths: Optional[str | list] = None
    improvements: Optional[str | list] = None
    instructorComment: Optional[str] = None
    evaluatedAt: Optional[str] = None


class InstructorStudentDetailResponse(BaseModel):
    """Per-student detailed results for instructor view"""
    ok: bool = True
    studentId: str
    studentName: str
    studentEmail: str
    assessmentId: str
    totalScore: float
    maxScore: int
    percentage: float
    grade: str
    submittedAt: Optional[str] = None
    questions: List[InstructorQuestionDetail]
    proctoring: ProctorChunkHealthResponse


class ReleaseResultsResponse(BaseModel):
    """Response after releasing results to students"""
    ok: bool = True
    assessmentId: str
    resultsReleased: bool


class SendReminderResponse(BaseModel):
    """Response after sending a reminder email"""
    ok: bool = True
    studentId: str
    assessmentId: str
    message: str


# ── Sprint 9: Question Preview and Editing (EPIC-3-3) ────────────────

class StudentQuestionItem(BaseModel):
    """A single student-specific generated question"""
    id: str
    text: str
    questionNumber: int
    questionType: str
    difficulty: str
    topic: str
    timeLimit: Optional[int] = None
    createdAt: str


class StudentQuestionListResponse(BaseModel):
    """Response with all questions for one student"""
    ok: bool = True
    assessmentId: str
    studentId: str
    questions: List[StudentQuestionItem]
    total: int


class UpdateStudentQuestionRequest(BaseModel):
    """Instructor edits the text (and optionally time limit) of a generated question"""
    text: str = Field(..., description="Updated question text", min_length=10)
    timeLimit: Optional[int] = Field(None, description="Per-question time limit in minutes (1–30). Stored as seconds.", ge=1, le=30)


class AddStudentQuestionRequest(BaseModel):
    """Instructor manually adds a question for a specific student"""
    text: str = Field(..., description="Question text", min_length=10)
    questionType: str = Field("manual", description="Question type")
    difficulty: str = Field("medium", description="easy / medium / hard")
    topic: str = Field("general", description="Question topic")
    timeLimit: Optional[int] = Field(None, description="Per-question time limit in minutes (1–30). Stored as seconds.", ge=1, le=30)


class StudentQuestionResponse(BaseModel):
    """Response after creating or updating a student question"""
    ok: bool = True
    question: StudentQuestionItem


class DeleteStudentQuestionResponse(BaseModel):
    """Response after deleting a student question"""
    ok: bool = True
    deletedId: str
