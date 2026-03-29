/**
 * Zustand Store - Global state management for student assessment
 */

import { create } from 'zustand';
import type {
  Question,
  Progress,
  Results,
  Assessment,
  ApiError,
} from '../types';
import {
  getStudentToken,
  getQuestions,
  type QuestionsResponse,
  submitAnswer,
  submitTextAnswer,
  submitAssessment,
  getProgress,
  getResults,
} from '../services/api';

const ensureStudentToken = async (studentId: string, assessmentId: string) => {
  if (!sessionStorage.getItem('studentToken')) {
    await getStudentToken(studentId, assessmentId);
  }
};
import { uploadAudio, validateAudioBlob } from '../services/s3';
import AudioRecorder from '../services/audio';
import ProctoringRecorder from '../services/proctoring';

interface AssessmentStore {
  // Student info
  studentId: string | null;
  assessmentId: string | null;
  assessment: Assessment | null;

  // Questions
  questions: Question[];
  currentQuestionIndex: number;

  // Progress
  progress: Progress | null;

  // Recording state (audio)
  isRecording: boolean;
  isPaused: boolean;
  recordingDuration: number;
  recordedBlob: Blob | null;
  recordingStartTime: number | null;
  audioRecorder: AudioRecorder | null;

  // Playback (audio)
  isPlaying: boolean;
  playbackUrl: string | null;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;

  // Answer mode — set by instructor, not student
  answerMode: 'oral' | 'written';
  preparationTime: number | null; // seconds of prep time for oral mode (null = no prep phase)
  textAnswer: string;

  // Proctoring state
  proctorStream: MediaStream | null;
  proctoring: ProctoringRecorder | null;
  isProctoringActive: boolean;
  cameraRevoked: boolean;
  consentGiven: boolean;

  // Results
  results: Results | null;
  isResultsReady: boolean;

  // Per-question answered tracking
  answeredQuestionIds: Set<string>;

  // Loading and error states
  isLoading: boolean;
  error: ApiError | null;

  // Actions
  setStudentInfo: (studentId: string, assessmentId: string) => void;
  loadQuestions: () => Promise<void>;
  loadProgress: () => Promise<void>;
  setAnswerMode: (mode: 'oral' | 'written') => void;
  setTextAnswer: (text: string) => void;

  // Recording actions (audio)
  initializeRecorder: () => Promise<void>;
  startRecording: () => void;
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;

  // Playback actions (audio)
  playRecording: () => void;
  stopPlayback: () => void;

  // Proctoring actions
  startProctoring: () => Promise<void>;
  stopProctoring: () => Promise<void>;
  restoreProctoring: () => Promise<void>;
  setConsentGiven: (given: boolean) => void;

  // Navigation
  nextQuestion: () => void;
  previousQuestion: () => void;
  goToQuestion: (index: number) => void;

  // Submission
  submitCurrentAnswer: () => Promise<void>;
  submitCurrentTextAnswer: () => Promise<void>;
  submitCompleteAssessment: () => Promise<void>;

  // Results
  loadResults: () => Promise<void>;

  // Utility
  clearError: () => void;
  reset: () => void;
}

export const useAssessmentStore = create<AssessmentStore>((set, get) => ({
  // Initial state
  studentId: null,
  assessmentId: null,
  assessment: null,
  questions: [],
  currentQuestionIndex: 0,
  progress: null,
  isRecording: false,
  isPaused: false,
  recordingDuration: 0,
  recordedBlob: null,
  recordingStartTime: null,
  audioRecorder: null,
  isPlaying: false,
  playbackUrl: null,
  isUploading: false,
  uploadProgress: 0,
  answerMode: 'oral' as 'oral' | 'written',
  preparationTime: null,
  textAnswer: '',
  proctorStream: null,
  proctoring: null,
  isProctoringActive: false,
  cameraRevoked: false,
  consentGiven: false,
  results: null,
  isResultsReady: false,
  answeredQuestionIds: new Set<string>(),
  isLoading: false,
  error: null,

  setStudentInfo: (studentId: string, assessmentId: string) => {
    set({ studentId, assessmentId, error: null });
  },

  setAnswerMode: (mode: 'oral' | 'written') => {
    set({ answerMode: mode });
  },

  setTextAnswer: (text: string) => {
    set({ textAnswer: text });
  },

  // Load questions from backend
  loadQuestions: async () => {
    const { studentId, assessmentId } = get();
    if (!studentId || !assessmentId) {
      set({ error: { message: 'Student ID or Assessment ID not set' } });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      await ensureStudentToken(studentId, assessmentId);
      const result: QuestionsResponse = await getQuestions(studentId, assessmentId);
      set({
        questions: result.questions,
        currentQuestionIndex: result.currentQuestionIndex,
        answerMode: result.answerMode,
        preparationTime: result.preparationTime ?? null,
        assessment: {
          id: assessmentId!,
          title: result.assessmentTitle || 'Oral Assessment',
          course: result.assessmentCourse || '',
          description: result.assessmentDescription || '',
          dueDate: '',
          totalQuestions: result.questions.length,
          timeLimit: result.questions[0]?.timeLimit,
          status: 'open',
          answerMode: result.answerMode,
          preparationTime: result.preparationTime,
        },
        isLoading: false,
      });
    } catch (error) {
      set({ error: error as ApiError, isLoading: false });
    }
  },

  // Load progress
  loadProgress: async () => {
    const { studentId, assessmentId, questions } = get();
    if (!studentId || !assessmentId) return;

    try {
      const progress = await getProgress(studentId, assessmentId);
      // Best-effort: assume first answeredQuestions questions (by index) are answered
      const ids = new Set<string>(
        questions.slice(0, progress.answeredQuestions).map((q) => q.id)
      );
      set({ progress, answeredQuestionIds: ids });
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  },

  // ─── Audio recording ───────────────────────────────────────────

  initializeRecorder: async () => {
    try {
      const recorder = new AudioRecorder();
      await recorder.initialize();
      set({ audioRecorder: recorder, error: null });
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to initialize recorder',
        },
      });
      throw error;
    }
  },

  startRecording: () => {
    const { audioRecorder } = get();
    if (!audioRecorder) {
      set({ error: { message: 'Recorder not initialized' } });
      return;
    }

    try {
      audioRecorder.start();
      set({
        isRecording: true,
        isPaused: false,
        recordingStartTime: Date.now(),
        recordedBlob: null,
        playbackUrl: null,
        error: null,
      });

      const interval = setInterval(() => {
        const { isRecording, audioRecorder } = get();
        if (!isRecording || !audioRecorder) {
          clearInterval(interval);
          return;
        }
        set({ recordingDuration: audioRecorder.getDuration() });
      }, 1000);
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to start recording',
        },
      });
    }
  },

  stopRecording: async () => {
    const { audioRecorder } = get();
    if (!audioRecorder) return;

    try {
      const blob = await audioRecorder.stop();
      const duration = audioRecorder.getDuration();
      set({ isRecording: false, isPaused: false, recordedBlob: blob, recordingDuration: duration });
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to stop recording',
        },
        isRecording: false,
      });
    }
  },

  pauseRecording: () => {
    const { audioRecorder } = get();
    if (!audioRecorder) return;
    audioRecorder.pause();
    set({ isPaused: true });
  },

  resumeRecording: () => {
    const { audioRecorder } = get();
    if (!audioRecorder) return;
    audioRecorder.resume();
    set({ isPaused: false });
  },

  cancelRecording: () => {
    const { audioRecorder } = get();
    if (!audioRecorder) return;

    try {
      if (audioRecorder.getState() !== 'inactive') audioRecorder.stop();
    } catch (error) {
      console.error('Error stopping recorder:', error);
    }

    set({
      isRecording: false,
      isPaused: false,
      recordedBlob: null,
      recordingDuration: 0,
      recordingStartTime: null,
      playbackUrl: null,
    });
  },

  playRecording: () => {
    const { recordedBlob, audioRecorder } = get();
    if (!recordedBlob || !audioRecorder) return;

    const url = audioRecorder.createAudioUrl(recordedBlob);
    const audio = new Audio(url);

    audio.onended = () => {
      set({ isPlaying: false });
      audioRecorder.releaseAudioUrl(url);
    };

    audio.play();
    set({ isPlaying: true, playbackUrl: url });
  },

  stopPlayback: () => {
    set({ isPlaying: false });
  },

  // ─── Proctoring ────────────────────────────────────────────────

  setConsentGiven: (given: boolean) => {
    set({ consentGiven: given });
  },

  startProctoring: async () => {
    const { studentId, assessmentId } = get();
    if (!studentId || !assessmentId) return;

    try {
      // Request a combined video+audio stream.
      // This stream is shared with the VideoRecorder when the student uses video
      // answer mode, avoiding a second getUserMedia call and the potential
      // NotReadableError on devices that don't allow two concurrent camera streams.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      const proctor = new ProctoringRecorder({
        studentId,
        assessmentId,
        onPermissionRevoked: () => {
          set({ cameraRevoked: true, isProctoringActive: false });
        },
        onChunkUploaded: (chunkIndex) => {
          console.debug(`[Proctoring] chunk ${chunkIndex} uploaded`);
        },
        onError: (error) => {
          console.warn('[Proctoring] chunk upload error:', error.message);
        },
      });

      proctor.start(stream);
      set({ proctorStream: stream, proctoring: proctor, isProctoringActive: true, cameraRevoked: false });
    } catch (error) {
      console.warn('Failed to start proctoring:', error);
      // Non-blocking — assessment can still proceed if camera request fails here
      // (the consent modal already obtained permissions; this is a re-request edge case)
    }
  },

  stopProctoring: async () => {
    const { proctoring, proctorStream } = get();
    if (proctoring) {
      proctoring.stop();
      await proctoring.drain();
    }
    if (proctorStream) {
      proctorStream.getTracks().forEach((t) => t.stop());
    }
    set({ proctoring: null, proctorStream: null, isProctoringActive: false });
  },

  restoreProctoring: async () => {
    await get().stopProctoring();
    await get().startProctoring();
  },

  // ─── Navigation (server-driven — no client-side jumping) ────────

  nextQuestion: () => {
    // No-op: advancement is handled by re-fetching after submit
  },

  previousQuestion: () => {
    // No-op: going back is not allowed
  },

  goToQuestion: () => {
    // No-op: jumping is not allowed
  },

  // ─── Submission ────────────────────────────────────────────────

  submitCurrentAnswer: async () => {
    const {
      studentId,
      assessmentId,
      recordedBlob,
      recordingDuration,
      questions,
      currentQuestionIndex,
    } = get();

    if (!studentId || !assessmentId || !recordedBlob) {
      set({ error: { message: 'No recording to submit' } });
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
      set({ error: { message: 'Invalid question' } });
      return;
    }

    set({ isUploading: true, uploadProgress: 0, error: null });

    try {
      validateAudioBlob(recordedBlob);

      const audioUrl = await uploadAudio(
        recordedBlob,
        studentId,
        currentQuestion.id,
        (progress) => { set({ uploadProgress: progress.percentage }); }
      );

      await submitAnswer(studentId, currentQuestion.id, assessmentId, audioUrl, recordingDuration);

      const newAnsweredIds = new Set(get().answeredQuestionIds);
      newAnsweredIds.add(currentQuestion.id);
      set({ isUploading: false, uploadProgress: 0, recordedBlob: null, recordingDuration: 0, playbackUrl: null, answeredQuestionIds: newAnsweredIds });

      // Re-fetch: server has advanced currentQuestionIdx, next question content is now available
      await get().loadQuestions();
      await get().loadProgress();
    } catch (error) {
      set({ error: error as ApiError, isUploading: false, uploadProgress: 0 });
    }
  },

  submitCurrentTextAnswer: async () => {
    const {
      studentId,
      assessmentId,
      textAnswer,
      questions,
      currentQuestionIndex,
    } = get();

    if (!studentId || !assessmentId || !textAnswer.trim()) {
      set({ error: { message: 'No text answer to submit' } });
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
      set({ error: { message: 'Invalid question' } });
      return;
    }

    set({ isUploading: true, error: null });

    try {
      await submitTextAnswer(studentId, currentQuestion.id, assessmentId, textAnswer.trim());

      const newAnsweredIds = new Set(get().answeredQuestionIds);
      newAnsweredIds.add(currentQuestion.id);
      set({ isUploading: false, textAnswer: '', answeredQuestionIds: newAnsweredIds });

      // Re-fetch: server has advanced currentQuestionIdx
      await get().loadQuestions();
      await get().loadProgress();
    } catch (error) {
      set({ error: error as ApiError, isUploading: false });
    }
  },

  submitCompleteAssessment: async () => {
    const { studentId, assessmentId } = get();
    if (!studentId || !assessmentId) return;

    set({ isLoading: true, error: null });

    try {
      await submitAssessment(studentId, assessmentId);
      await get().loadProgress();
      await get().stopProctoring();
      set({ isLoading: false });
    } catch (error) {
      set({ error: error as ApiError, isLoading: false });
    }
  },

  // Load results
  loadResults: async () => {
    const { studentId, assessmentId } = get();
    if (!studentId || !assessmentId) return;

    set({ isLoading: true, error: null });

    try {
      await ensureStudentToken(studentId, assessmentId);
      const results = await getResults(studentId, assessmentId);
      set({ results, isResultsReady: true, isLoading: false });
    } catch (error) {
      set({ error: error as ApiError, isResultsReady: false, isLoading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    const { audioRecorder, proctoring, proctorStream } = get();
    if (audioRecorder) audioRecorder.cleanup();
    if (proctoring) { proctoring.stop(); }
    if (proctorStream) proctorStream.getTracks().forEach((t) => t.stop());

    set({
      studentId: null,
      assessmentId: null,
      assessment: null,
      questions: [],
      currentQuestionIndex: 0,
      progress: null,
      isRecording: false,
      isPaused: false,
      recordingDuration: 0,
      recordedBlob: null,
      recordingStartTime: null,
      audioRecorder: null,
      isPlaying: false,
      playbackUrl: null,
      isUploading: false,
      uploadProgress: 0,
      answerMode: 'oral' as 'oral' | 'written',
      preparationTime: null,
      textAnswer: '',
      proctorStream: null,
      proctoring: null,
      isProctoringActive: false,
      cameraRevoked: false,
      consentGiven: false,
      results: null,
      isResultsReady: false,
      answeredQuestionIds: new Set<string>(),
      isLoading: false,
      error: null,
    });
  },
}));

export default useAssessmentStore;
