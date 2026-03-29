// Core domain types for oral assessment system

export interface Assessment {
  id: string;
  title: string;
  description: string;
  course: string;
  dueDate: Date;
  totalQuestions: number;
  timeLimit?: number; // minutes per question
  createdAt: Date;
  createdBy: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  resultsReleased?: boolean;
  accessMode?: 'open' | 'scheduled';
  scheduledWindowStart?: string;
  scheduledWindowEnd?: string;
  assignmentBrief?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  studentId: string;
}

export interface Question {
  id: string;
  assessmentId: string;
  studentId: string;
  questionNumber: number;
  questionText: string;
  context?: string; // Student's code or assignment context
  expectedTopics?: string[];
  generatedAt: Date;
}

export interface StudentAnswer {
  id: string;
  questionId: string;
  studentId: string;
  audioUrl: string;
  transcription?: string;
  recordedAt: Date;
  duration: number; // seconds
}

export interface Evaluation {
  id: string;
  answerId: string;
  questionId: string;
  studentId: string;
  correctnessScore: number; // 0-5
  understandingScore: number; // 0-5
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  evaluatedAt: Date;
}

export interface StudentProgress {
  studentId: string;
  assessmentId: string;
  questionsAnswered: number;
  totalQuestions: number;
  currentQuestion?: number;
  status: 'not-started' | 'in-progress' | 'completed' | 'submitted';
  startedAt?: string | Date;
  submittedAt?: string | Date;
}

export interface AssessmentResults {
  studentId: string;
  assessmentId: string;
  name?: string;
  email?: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  grade: 'Excellent' | 'Competent' | 'Developing' | 'Unsatisfactory';
  evaluations: Evaluation[];
  overallFeedback: string;
  completedAt: Date;
}

export interface UploadedStudent {
  name: string;
  email: string;
  studentId: string;
  code: string; // Student's submitted code
  assignmentFile?: string; // Path to assignment file
}

export interface QuestionGenerationJob {
  jobId: string;
  assessmentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalStudents: number;
  processedCount: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface EvaluationJob {
  jobId: string;
  assessmentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalStudents: number;
  processedCount: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

// API Request/Response types
export interface CreateAssessmentRequest {
  title: string;
  description: string;
  course: string;
  dueDate: string;
  totalQuestions: number;
  timeLimit?: number;
  accessMode?: 'open' | 'scheduled';
  scheduledWindowStart?: string;
  scheduledWindowEnd?: string;
  answerMode?: 'oral' | 'written';
  preparationTime?: number;
}

export interface UploadStudentsRequest {
  assessmentId: string;
  students: UploadedStudent[];
}

export interface GenerateQuestionsRequest {
  assessmentId: string;
  studentIds?: string[]; // If empty, generate for all students
}

export interface SubmitAnswerRequest {
  questionId: string;
  studentId: string;
  audioFile: File;
}

export interface GetPresignedUrlRequest {
  assessmentId: string;
  studentId: string;
  questionId: string;
  fileName: string;
  contentType: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}
