/**
 * TypeScript type definitions for Student Assessment application
 */

export interface Question {
  id: string;
  text?: string;
  codeContext?: string;
  assessmentId: string;
  studentId: string;
  difficulty?: string;
  topic?: string;
  questionNumber?: number;
  questionType?: 'specific' | 'general';
  timeLimit?: number; // per-question time limit in seconds (null = assessment default)
  createdAt: string;
  /**
   * Optional server-stamped time (ISO 8601, server clock) at which the backend
   * first served this question to this student. ASSUMED BACKEND CONTRACT
   * introduced by the client — GET /api/student/{id}/assessment/{aid}/questions
   * MAY return it, so all consumers MUST work when it is `undefined`. When
   * present, QuestionTimer anchors the per-question countdown to it so the clock
   * is authoritative across refreshes; when absent, the client falls back to a
   * locally persisted anchor (sessionStorage `qtimer_start_*`). The backend is
   * out of scope here — no endpoint is added or called.
   */
  questionStartedAt?: string;
}

export interface Answer {
  questionId: string;
  audioUrl: string;
  duration: number;
  transcript?: string;
  submittedAt?: string;
}

export interface Progress {
  studentId: string;
  assessmentId: string;
  totalQuestions: number;
  answeredQuestions: number;
  percentage: number;
  status: 'not-started' | 'in-progress' | 'submitted';
  startedAt?: string;
  submittedAt?: string;
  /**
   * Authoritative list of question ids the student has actually answered.
   * BACKEND CONTRACT introduced by the client — the FastAPI backend on :8000
   * may not send it yet, so all consumers MUST work when this is `undefined`
   * (see `loadProgress` in store/assessmentStore.ts: it falls back to the
   * legacy "first N by array order" heuristic). When present, the client
   * prefers this list over the heuristic so Next/Submit gate on real answer
   * identity, not array position. Server should return it from
   *   GET /api/student/{studentId}/assessment/{assessmentId}/progress
   * as `answeredQuestionIds` (camel) or `answered_question_ids` (snake).
   */
  answeredQuestionIds?: string[];
}

export interface QuestionResult {
  questionId: string;
  questionNumber: number;
  questionText: string;
  questionType: string;
  audioUrl: string;
  transcript?: string;
  correctnessScore: number;
  understandingScore: number;
  // `null` when the question wasn't graded (server sends null for ungraded items).
  totalScore: number | null;
  maxScore?: number;
  feedback: string;
  strengths?: string[];
  weaknesses?: string[];
  suggestedImprovements?: string[];
  /**
   * Per-question status. BACKEND CONTRACT introduced by the client — the server
   * may not send it yet, so all rendering MUST work when this is `undefined`
   * (see `deriveResultStatus` in utils/resultHelpers for the client fallback).
   * Server should set: 'skipped' for skipped questions, 'grading-failed' when
   * evaluation errored, 'not-attempted' for unanswered, and 'graded' (or omit)
   * for normal results.
   */
  status?: 'graded' | 'skipped' | 'not-attempted' | 'grading-failed';
}

export interface Results {
  studentId: string;
  assessmentId: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  completedAt?: string;
  submittedAt?: string;
  questions: QuestionResult[];
}

export interface Assessment {
  id: string;
  title: string;
  course: string;
  description: string;
  dueDate: string;
  totalQuestions: number;
  timeLimit?: number;
  status: string;
  answerMode?: 'oral' | 'written';
  preparationTime?: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  fileUrl: string;
}

export interface ApiError {
  message: string;
  status?: number;
  details?: unknown;
}
