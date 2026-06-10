/**
 * API Service Layer - Handles all backend communication
 */

import axios, { AxiosError } from 'axios';
import type {
  Question,
  Progress,
  Results,
  UploadUrlResponse,
  ApiError,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout (accommodates large audio uploads on slow networks)
});

// Attach student session token to every request if present
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('studentToken');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh token on 401/403
let isRefreshing = false;
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retried?: boolean };
    if (
      originalRequest &&
      !originalRequest._retried &&
      !isRefreshing &&
      (error.response?.status === 401 || error.response?.status === 403) &&
      !originalRequest.url?.includes('/student/token')
    ) {
      // Try to re-fetch a fresh token using stored student/assessment info
      const studentId = sessionStorage.getItem('studentId');
      const assessmentId = sessionStorage.getItem('assessmentId');
      if (studentId && assessmentId) {
        isRefreshing = true;
        originalRequest._retried = true;
        try {
          const resp = await apiClient.post('/api/student/token', {
            student_id: studentId,
            assessment_id: assessmentId,
          });
          const token: string = resp.data.access_token;
          sessionStorage.setItem('studentToken', token);
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return apiClient(originalRequest);
        } catch {
          // Token refresh also failed — fall through to normal error handling
        } finally {
          isRefreshing = false;
        }
      }
    }
    return Promise.reject(error);
  }
);

// Error handler
const handleApiError = (error: AxiosError): never => {
  if (error.response) {
    // Server responded with an error status
    const responseData = error.response.data as { detail?: string };
    let message = responseData?.detail || error.message;

    // Provide clearer messages for common status codes, but preserve domain-specific detail messages
    if (error.response.status === 404 && !responseData?.detail) {
      message = 'Assessment not found — please check your link or contact your instructor.';
    } else if (error.response.status === 403) {
      message = 'Access denied — this assessment link may have expired. Retrying...';
    }

    const apiError: ApiError = {
      message,
      status: error.response.status,
      details: error.response.data,
    };
    throw apiError;
  } else if (error.request) {
    // Request made but no response received (network issue)
    throw {
      message: 'Could not reach the server — please check your internet connection and try again.',
      status: 0,
    } as ApiError;
  } else {
    // Something else went wrong
    throw {
      message: error.message || 'An unexpected error occurred',
    } as ApiError;
  }
};

/**
 * Get all questions for a student's assessment
 */
export interface QuestionsResponse {
  questions: Question[];
  currentQuestionIndex: number;
  answerMode: 'oral' | 'written';
  preparationTime?: number;
  assessmentTitle?: string;
  assessmentCourse?: string;
  assessmentDescription?: string;
}

export async function getQuestions(
  studentId: string,
  assessmentId: string
): Promise<QuestionsResponse> {
  try {
    const response = await apiClient.get(
      `/api/student/${studentId}/assessment/${assessmentId}/questions`
    );
    return {
      // Questions pass straight through, so any field the backend includes on a
      // question survives — including the optional `questionStartedAt` (ISO,
      // ASSUMED backend contract; see types/index.ts). The client must NOT assume
      // it is present and falls back to a locally persisted timer anchor when it
      // is absent.
      questions: response.data.questions || [],
      currentQuestionIndex: response.data.currentQuestionIndex ?? 0,
      answerMode: response.data.answerMode || 'oral',
      preparationTime: response.data.preparationTime,
      assessmentTitle: response.data.assessmentTitle,
      assessmentCourse: response.data.assessmentCourse,
      assessmentDescription: response.data.assessmentDescription,
    };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Submit an audio answer for a question
 */
export async function submitAnswer(
  studentId: string,
  questionId: string,
  assessmentId: string,
  audioUrl: string,
  duration: number
): Promise<void> {
  try {
    await apiClient.post(`/api/student/${studentId}/answer`, {
      question_id: questionId,
      assessment_id: assessmentId,
      answer_type: 'audio',
      audio_url: audioUrl,
      duration,
    });
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Submit a text answer for a question
 */
export async function submitTextAnswer(
  studentId: string,
  questionId: string,
  assessmentId: string,
  textContent: string
): Promise<void> {
  try {
    await apiClient.post(`/api/student/${studentId}/answer`, {
      question_id: questionId,
      assessment_id: assessmentId,
      answer_type: 'text',
      text_content: textContent,
    });
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Submit an explicit "skipped / no answer" marker for a question.
 *
 * NEW CONTRACT — not yet implemented by the FastAPI backend on :8000.
 *   POST /api/student/{studentId}/answer
 *   { question_id, assessment_id, answer_type: 'skipped', mode: 'oral' | 'written' }
 *
 * The backend currently only accepts answer_type 'audio' | 'text'. This call
 * lets the server record a genuine non-answer (zero credit) WITHOUT a fake
 * transcript — critical for oral questions, where a placeholder text answer
 * like '(time expired)' would otherwise be scored as a substantive response.
 *
 * Until the backend recognises 'skipped' it will likely reject this payload
 * with 400/422; callers MUST guard the call and degrade gracefully (see
 * skipCurrentQuestion in the store). Documented here so the backend team can
 * wire the real contract: a 'skipped' answer must be stored as a non-answer
 * and NEVER evaluated as text/audio content.
 */
export async function submitSkip(
  studentId: string,
  questionId: string,
  assessmentId: string,
  mode: 'oral' | 'written'
): Promise<void> {
  try {
    await apiClient.post(`/api/student/${studentId}/answer`, {
      question_id: questionId,
      assessment_id: assessmentId,
      answer_type: 'skipped',
      mode,
    });
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Log a proctoring chunk manifest entry
 */
export async function submitProctorChunk(
  studentId: string,
  assessmentId: string,
  chunkUrl: string,
  chunkIndex: number
): Promise<void> {
  try {
    await apiClient.post(`/api/student/${studentId}/proctoring-chunk`, {
      assessment_id: assessmentId,
      chunk_url: chunkUrl,
      chunk_index: chunkIndex,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Submit the complete assessment
 */
export async function submitAssessment(
  studentId: string,
  assessmentId: string
): Promise<void> {
  try {
    await apiClient.put(`/api/student/${studentId}/submit`, {
      assessment_id: assessmentId,
    });
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Get current progress for student's assessment
 */
export async function getProgress(
  studentId: string,
  assessmentId: string
): Promise<Progress> {
  try {
    const response = await apiClient.get(
      `/api/student/${studentId}/assessment/${assessmentId}/progress`
    );
    const data = response.data;
    // Surface the server's authoritative answered-id list when present (accept
    // either snake or camel casing). Left `undefined` when the backend doesn't
    // send it, so the store degrades to the legacy index heuristic — see the
    // `answeredQuestionIds` doc on the Progress type.
    const answeredQuestionIds: string[] | undefined =
      data?.answeredQuestionIds ?? data?.answered_question_ids ?? undefined;
    return { ...data, answeredQuestionIds };
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Get evaluation results for completed assessment
 */
export async function getResults(
  studentId: string,
  assessmentId: string
): Promise<Results> {
  try {
    const response = await apiClient.get(
      `/api/student/${studentId}/assessment/${assessmentId}/results`
    );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Download the results PDF for a completed assessment.
 *
 * Routed through `apiClient` so it inherits the auth-injection and 401/403
 * token-refresh interceptors (a raw `fetch` would bypass both). Returns the raw
 * PDF blob; the caller is responsible for triggering the browser download.
 */
export async function getResultsPdf(
  studentId: string,
  assessmentId: string
): Promise<Blob> {
  try {
    const response = await apiClient.get(
      `/api/student/${studentId}/assessment/${assessmentId}/results/pdf`,
      { responseType: 'blob' }
    );
    return response.data as Blob;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Get S3 presigned upload URL for audio file
 */
export async function getUploadUrl(
  filename: string,
  contentType: string = 'audio/webm'
): Promise<UploadUrlResponse> {
  try {
    const response = await apiClient.post(
      `/api/s3/upload-url?filename=${encodeURIComponent(filename)}&content_type=${encodeURIComponent(contentType)}`
    );
    return response.data;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

/**
 * Upload audio file directly to S3
 */
export async function uploadAudioToS3(
  uploadUrl: string,
  audioBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<void> {
  try {
    await axios.put(uploadUrl, audioBlob, {
      headers: {
        'Content-Type': audioBlob.type,
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });
  } catch (error) {
    throw {
      message: 'Failed to upload audio file',
      details: error,
    } as ApiError;
  }
}

/**
 * Fetch a scoped student session JWT from the public token endpoint.
 * The backend verifies enrollment before issuing the token.
 * Stores the token in sessionStorage for the interceptor to pick up.
 */
export async function getStudentToken(
  studentId: string,
  assessmentId: string
): Promise<string> {
  try {
    const response = await apiClient.post('/api/student/token', {
      student_id: studentId,
      assessment_id: assessmentId,
    });
    const token: string = response.data.access_token;
    sessionStorage.setItem('studentToken', token);
    return token;
  } catch (error) {
    return handleApiError(error as AxiosError);
  }
}

export default {
  getStudentToken,
  getQuestions,
  submitAnswer,
  submitTextAnswer,
  submitSkip,
  submitProctorChunk,
  submitAssessment,
  getProgress,
  getResults,
  getResultsPdf,
  getUploadUrl,
  uploadAudioToS3,
};
