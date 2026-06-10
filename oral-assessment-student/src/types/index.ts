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
