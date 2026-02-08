import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  Assessment,
  Student,
  CreateAssessmentRequest,
  UploadStudentsRequest,
  GenerateQuestionsRequest,
  QuestionGenerationJob,
  StudentProgress,
  Question,
  PresignedUrlResponse,
  GetPresignedUrlRequest,
  AssessmentResults,
  EvaluationJob,
} from '../../../shared/types/assessment';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth token if needed
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Assessment endpoints
  async createAssessment(data: CreateAssessmentRequest): Promise<Assessment> {
    const response = await this.client.post<Assessment>('/api/assessment/create', data);
    return response.data;
  }

  async getAssessment(assessmentId: string): Promise<Assessment> {
    const response = await this.client.get<Assessment>(`/api/assessment/${assessmentId}`);
    return response.data;
  }

  async listAssessments(): Promise<Assessment[]> {
    const response = await this.client.get<{ ok: boolean; assessments: Assessment[] }>('/api/assessment/list');
    return response.data.assessments || [];
  }

  // Student upload endpoints
  async uploadStudents(data: UploadStudentsRequest): Promise<void> {
    await this.client.post(`/api/assessment/${data.assessmentId}/upload-students`, {
      students: data.students,
    });
  }

  // Question generation endpoints
  async generateQuestions(data: GenerateQuestionsRequest): Promise<QuestionGenerationJob> {
    const response = await this.client.post<QuestionGenerationJob>(
      `/api/assessment/${data.assessmentId}/generate-questions-batch`,
      { student_ids: data.studentIds }
    );
    return response.data;
  }

  async getQuestionGenerationStatus(
    assessmentId: string,
    jobId: string
  ): Promise<QuestionGenerationJob> {
    const response = await this.client.get<QuestionGenerationJob>(
      `/api/assessment/${assessmentId}/generation-status/${jobId}`
    );
    return response.data;
  }

  async getGenerationJobStatus(jobId: string): Promise<QuestionGenerationJob> {
    const response = await this.client.get<QuestionGenerationJob>(
      `/api/jobs/generation/${jobId}`
    );
    return response.data;
  }

  // S3 upload endpoints
  async getPresignedUploadUrl(data: GetPresignedUrlRequest): Promise<PresignedUrlResponse> {
    const response = await this.client.post<PresignedUrlResponse>('/api/s3/upload-url', data);
    return response.data;
  }

  async uploadAudioToS3(presignedUrl: string, file: File): Promise<void> {
    await axios.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
    });
  }

  // Student answer endpoints
  async submitAnswer(
    studentId: string,
    questionId: string,
    audioUrl: string,
    duration: number
  ): Promise<void> {
    await this.client.post(`/api/student/${studentId}/answer`, {
      question_id: questionId,
      audio_url: audioUrl,
      duration,
    });
  }

  async submitAssessment(studentId: string, assessmentId: string): Promise<void> {
    await this.client.put(`/api/student/${studentId}/submit`, {
      assessment_id: assessmentId,
    });
  }

  // Student progress endpoints
  async getStudentProgress(studentId: string, assessmentId: string): Promise<StudentProgress> {
    const response = await this.client.get<StudentProgress>(
      `/api/student/${studentId}/assessment/${assessmentId}/progress`
    );
    return response.data;
  }

  async getStudentQuestions(studentId: string, assessmentId: string): Promise<Question[]> {
    const response = await this.client.get<Question[]>(
      `/api/student/${studentId}/assessment/${assessmentId}/questions`
    );
    return response.data;
  }

  // Evaluation endpoints
  async evaluateAssessment(assessmentId: string, studentIds?: string[]): Promise<EvaluationJob> {
    const response = await this.client.post<EvaluationJob>(
      `/api/assessment/${assessmentId}/evaluate-batch`,
      { student_ids: studentIds }
    );
    return response.data;
  }

  async getEvaluationStatus(assessmentId: string, jobId: string): Promise<EvaluationJob> {
    const response = await this.client.get<EvaluationJob>(
      `/api/assessment/${assessmentId}/evaluation-status/${jobId}`
    );
    return response.data;
  }

  async getAssessmentResults(assessmentId: string): Promise<AssessmentResults[]> {
    const response = await this.client.get<{ ok: boolean; results: AssessmentResults[] }>(
      `/api/assessment/${assessmentId}/results`
    );
    return response.data.results || [];
  }

  async getStudentResults(studentId: string, assessmentId: string): Promise<AssessmentResults> {
    const response = await this.client.get<AssessmentResults>(
      `/api/student/${studentId}/assessment/${assessmentId}/results`
    );
    return response.data;
  }

  // Progress monitoring endpoints
  async getAssessmentProgress(assessmentId: string): Promise<StudentProgress[]> {
    const response = await this.client.get<{ 
      ok: boolean; 
      students: StudentProgress[];
      summary?: { total: number; notStarted: number; inProgress: number; completed: number }
    }>(
      `/api/assessment/${assessmentId}/progress`
    );
    return response.data.students || [];
  }

  async getAssessmentStudents(assessmentId: string): Promise<Student[]> {
    const response = await this.client.get<Student[]>(
      `/api/assessment/${assessmentId}/students`
    );
    return response.data;
  }
}

export const apiService = new ApiService();
