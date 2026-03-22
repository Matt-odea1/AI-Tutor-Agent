/**
 * TypeScript type definitions for Student Assessment application
 */

export interface Question {
  id: string;
  text: string;
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
  totalScore: number;
  maxScore?: number;
  feedback: string;
  strengths?: string[];
  weaknesses?: string[];
  suggestedImprovements?: string[];
}

export interface Results {
  studentId: string;
  assessmentId: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: string;
  completedAt?: string;
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
