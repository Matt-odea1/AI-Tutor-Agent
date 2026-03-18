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
  getQuestions,
  submitAnswer,
  submitVideoAnswer,
  submitTextAnswer,
  submitAssessment,
  getProgress,
  getResults,
} from '../services/api';
import { uploadAudio, uploadVideo, validateAudioBlob } from '../services/s3';
import AudioRecorder from '../services/audio';
import VideoRecorder from '../services/video';
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

  // Answer mode
  answerMode: 'audio' | 'text' | 'video';
  textAnswer: string;

  // Video recording state
  videoRecorder: VideoRecorder | null;
  videoLiveStream: MediaStream | null;
  videoBlob: Blob | null;
  videoPreviewUrl: string | null;

  // Proctoring state
  proctorStream: MediaStream | null;
  proctoring: ProctoringRecorder | null;
  isProctoringActive: boolean;
  cameraRevoked: boolean;
  consentGiven: boolean;

  // Results
  results: Results | null;
  isResultsReady: boolean;

  // Loading and error states
  isLoading: boolean;
  error: ApiError | null;

  // Actions
  setStudentInfo: (studentId: string, assessmentId: string) => void;
  loadQuestions: () => Promise<void>;
  loadProgress: () => Promise<void>;
  setAnswerMode: (mode: 'audio' | 'text' | 'video') => void;
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

  // Video recording actions
  initializeVideoRecorder: () => Promise<MediaStream | null>;
  startVideoRecording: () => void;
  stopVideoRecording: () => Promise<void>;
  pauseVideoRecording: () => void;
  resumeVideoRecording: () => void;
  cancelVideoRecording: () => void;

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
  submitCurrentVideoAnswer: () => Promise<void>;
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
  answerMode: 'audio',
  textAnswer: '',
  videoRecorder: null,
  videoLiveStream: null,
  videoBlob: null,
  videoPreviewUrl: null,
  proctorStream: null,
  proctoring: null,
  isProctoringActive: false,
  cameraRevoked: false,
  consentGiven: false,
  results: null,
  isResultsReady: false,
  isLoading: false,
  error: null,

  setStudentInfo: (studentId: string, assessmentId: string) => {
    set({ studentId, assessmentId, error: null });
  },

  setAnswerMode: (mode: 'audio' | 'text' | 'video') => {
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
      const questions = await getQuestions(studentId, assessmentId);
      set({ questions, isLoading: false });
    } catch (error) {
      set({ error: error as ApiError, isLoading: false });
    }
  },

  // Load progress
  loadProgress: async () => {
    const { studentId, assessmentId } = get();
    if (!studentId || !assessmentId) return;

    try {
      const progress = await getProgress(studentId, assessmentId);
      set({ progress });
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

  // ─── Video recording ───────────────────────────────────────────

  initializeVideoRecorder: async () => {
    try {
      const recorder = new VideoRecorder();
      // Reuse the proctoring stream when available — avoids a second getUserMedia
      // call which can fail with NotReadableError on devices that don't allow two
      // concurrent camera streams.
      const { proctorStream } = get();
      const stream = await recorder.initialize(proctorStream ?? undefined);
      set({ videoRecorder: recorder, videoLiveStream: stream, error: null });
      return stream;
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to initialize video recorder',
        },
      });
      throw error;
    }
  },

  startVideoRecording: () => {
    const { videoRecorder } = get();
    if (!videoRecorder) {
      set({ error: { message: 'Video recorder not initialized' } });
      return;
    }

    try {
      videoRecorder.start();
      set({
        isRecording: true,
        isPaused: false,
        recordingStartTime: Date.now(),
        videoBlob: null,
        videoPreviewUrl: null,
        error: null,
      });

      const interval = setInterval(() => {
        const { isRecording, videoRecorder } = get();
        if (!isRecording || !videoRecorder) {
          clearInterval(interval);
          return;
        }
        set({ recordingDuration: videoRecorder.getDuration() });
      }, 1000);
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to start video recording',
        },
      });
    }
  },

  stopVideoRecording: async () => {
    const { videoRecorder } = get();
    if (!videoRecorder) return;

    try {
      const blob = await videoRecorder.stop();
      const duration = videoRecorder.getDuration();
      const previewUrl = videoRecorder.createVideoUrl(blob);
      set({
        isRecording: false,
        isPaused: false,
        videoBlob: blob,
        recordingDuration: duration,
        videoPreviewUrl: previewUrl,
      });
    } catch (error) {
      set({
        error: {
          message: error instanceof Error ? error.message : 'Failed to stop video recording',
        },
        isRecording: false,
      });
    }
  },

  pauseVideoRecording: () => {
    const { videoRecorder } = get();
    if (!videoRecorder) return;
    videoRecorder.pause();
    set({ isPaused: true });
  },

  resumeVideoRecording: () => {
    const { videoRecorder } = get();
    if (!videoRecorder) return;
    videoRecorder.resume();
    set({ isPaused: false });
  },

  cancelVideoRecording: () => {
    const { videoRecorder, videoPreviewUrl } = get();
    if (!videoRecorder) return;

    try {
      if (videoRecorder.getState() !== 'inactive') videoRecorder.stop();
    } catch (error) {
      console.error('Error stopping video recorder:', error);
    }

    if (videoPreviewUrl) videoRecorder.releaseVideoUrl(videoPreviewUrl);

    set({
      isRecording: false,
      isPaused: false,
      videoBlob: null,
      recordingDuration: 0,
      recordingStartTime: null,
      videoPreviewUrl: null,
    });
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

  // ─── Navigation ────────────────────────────────────────────────

  nextQuestion: () => {
    const { currentQuestionIndex, questions } = get();
    if (currentQuestionIndex < questions.length - 1) {
      set({
        currentQuestionIndex: currentQuestionIndex + 1,
        recordedBlob: null,
        recordingDuration: 0,
        playbackUrl: null,
        videoBlob: null,
        videoPreviewUrl: null,
        textAnswer: '',
        error: null,
      });
    }
  },

  previousQuestion: () => {
    const { currentQuestionIndex } = get();
    if (currentQuestionIndex > 0) {
      set({
        currentQuestionIndex: currentQuestionIndex - 1,
        recordedBlob: null,
        recordingDuration: 0,
        playbackUrl: null,
        videoBlob: null,
        videoPreviewUrl: null,
        textAnswer: '',
        error: null,
      });
    }
  },

  goToQuestion: (index: number) => {
    const { questions } = get();
    if (index >= 0 && index < questions.length) {
      set({
        currentQuestionIndex: index,
        recordedBlob: null,
        recordingDuration: 0,
        playbackUrl: null,
        videoBlob: null,
        videoPreviewUrl: null,
        textAnswer: '',
        error: null,
      });
    }
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
      await get().loadProgress();

      set({ isUploading: false, uploadProgress: 0, recordedBlob: null, recordingDuration: 0, playbackUrl: null });

      if (currentQuestionIndex < questions.length - 1) get().nextQuestion();
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
      await get().loadProgress();

      set({ isUploading: false, textAnswer: '' });

      if (currentQuestionIndex < questions.length - 1) get().nextQuestion();
    } catch (error) {
      set({ error: error as ApiError, isUploading: false });
    }
  },

  submitCurrentVideoAnswer: async () => {
    const {
      studentId,
      assessmentId,
      videoBlob,
      recordingDuration,
      questions,
      currentQuestionIndex,
      videoRecorder,
      videoPreviewUrl,
    } = get();

    if (!studentId || !assessmentId || !videoBlob) {
      set({ error: { message: 'No video recording to submit' } });
      return;
    }

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
      set({ error: { message: 'Invalid question' } });
      return;
    }

    set({ isUploading: true, uploadProgress: 0, error: null });

    try {
      const fileUrl = await uploadVideo(
        videoBlob,
        studentId,
        currentQuestion.id,
        (progress) => { set({ uploadProgress: progress.percentage }); }
      );

      await submitVideoAnswer(studentId, currentQuestion.id, assessmentId, fileUrl, recordingDuration);
      await get().loadProgress();

      // Release object URL
      if (videoPreviewUrl && videoRecorder) videoRecorder.releaseVideoUrl(videoPreviewUrl);

      set({
        isUploading: false,
        uploadProgress: 0,
        videoBlob: null,
        recordingDuration: 0,
        videoPreviewUrl: null,
      });

      if (currentQuestionIndex < questions.length - 1) get().nextQuestion();
    } catch (error) {
      set({ error: error as ApiError, isUploading: false, uploadProgress: 0 });
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
    const { audioRecorder, videoRecorder, proctoring, proctorStream, videoPreviewUrl } = get();
    if (audioRecorder) audioRecorder.cleanup();
    if (videoRecorder) {
      if (videoPreviewUrl) videoRecorder.releaseVideoUrl(videoPreviewUrl);
      videoRecorder.cleanup();
    }
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
      answerMode: 'audio',
      textAnswer: '',
      videoRecorder: null,
      videoLiveStream: null,
      videoBlob: null,
      videoPreviewUrl: null,
      proctorStream: null,
      proctoring: null,
      isProctoringActive: false,
      cameraRevoked: false,
      consentGiven: false,
      results: null,
      isResultsReady: false,
      isLoading: false,
      error: null,
    });
  },
}));

export default useAssessmentStore;
