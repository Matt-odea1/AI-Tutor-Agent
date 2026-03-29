import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import QuestionDisplay from '../components/QuestionDisplay';
import ProgressTracker from '../components/ProgressTracker';
import AudioRecorder from '../components/AudioRecorder';
import TextAnswerInput from '../components/TextAnswerInput';
import QuestionTimer from '../components/QuestionTimer';
import ConsentModal from '../components/ConsentModal';
import PreAssessmentOverview from '../components/PreAssessmentOverview';
import ProctorCamera from '../components/ProctorCamera';
import CameraRevokedOverlay from '../components/CameraRevokedOverlay';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { parseUrlParams, checkBrowserSupport } from '../utils/helpers';
import { useToastStore } from '../store/toastStore';

export default function TakeAssessment() {
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isRestoringCamera, setIsRestoringCamera] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [assessmentStarted, setAssessmentStartedRaw] = useState(false);
  // Preparation countdown for oral mode (counts down from preparationTime → 0)
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number | null>(null);
  const [prepDone, setPrepDone] = useState(false);
  const [prepElapsed, setPrepElapsed] = useState(0); // seconds elapsed in prep phase
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Wrapper to persist assessmentStarted to sessionStorage
  const setAssessmentStarted = (v: boolean) => {
    setAssessmentStartedRaw(v);
    if (v && assessmentId) sessionStorage.setItem(`started_${assessmentId}`, 'true');
  };

  const {
    studentId,
    assessmentId,
    assessment,
    questions,
    currentQuestionIndex,
    progress,
    isLoading,
    isUploading,
    error,
    answerMode,
    preparationTime,
    textAnswer,
    recordedBlob,
    proctorStream,
    isProctoringActive,
    cameraRevoked,
    consentGiven,
    answeredQuestionIds,
    proctoringWarning,
    lastFailedAction,
    setStudentInfo,
    loadQuestions,
    loadProgress,
    nextQuestion,
    submitCurrentAnswer,
    submitCurrentTextAnswer,
    skipCurrentQuestion,
    submitCompleteAssessment,
    setTextAnswer,
    setConsentGiven,
    startProctoring,
    restoreProctoring,
    clearError,
    clearProctoringWarning,
    retryLastAction,
  } = useAssessmentStore();

  // Initialize assessment on mount
  useEffect(() => {
    const urlParams = parseUrlParams(window.location.pathname);
    if (urlParams) {
      setStudentInfo(urlParams.studentId, urlParams.assessmentId);
    }
  }, [setStudentInfo]);

  // Load questions when student info is set
  useEffect(() => {
    if (studentId && assessmentId && questions.length === 0) {
      loadQuestions();
      loadProgress();
    }
  }, [studentId, assessmentId, questions.length, loadQuestions, loadProgress]);

  // Warn before accidental tab close mid-assessment
  useEffect(() => {
    if (!assessmentStarted) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [assessmentStarted]);

  // Restore consent/started state from server + sessionStorage on refresh
  useEffect(() => {
    if (questions.length === 0) return; // not loaded yet
    // If server says we're past Q1, we've already started
    if (currentQuestionIndex > 0) {
      if (!consentGiven) setConsentGiven(true);
      if (!assessmentStarted) setAssessmentStarted(true);
    } else if (assessmentId) {
      // Q1 but check sessionStorage (consented + started but haven't answered Q1 yet)
      if (sessionStorage.getItem(`consent_${assessmentId}`) === 'true' && !consentGiven) {
        setConsentGiven(true);
      }
      if (sessionStorage.getItem(`started_${assessmentId}`) === 'true' && !assessmentStarted) {
        setAssessmentStartedRaw(true);
      }
    }
  }, [questions.length, currentQuestionIndex, assessmentId]);

  // Check browser support
  useEffect(() => {
    const { supported, missing } = checkBrowserSupport();
    if (!supported) {
      setBrowserError(
        `Your browser is missing required features: ${missing.join(', ')}. ` +
        'Please use a modern browser like Chrome, Firefox, or Safari.'
      );
    }
  }, []);

  // Block browser back button during assessment
  useEffect(() => {
    if (!assessmentStarted) return;
    // Push a dummy history entry so back button triggers popstate instead of navigating away
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [assessmentStarted]);

  // Reset per-question state whenever the question changes
  useEffect(() => {
    setPrepDone(false);
    clearError(); // clear errors from previous question
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);

    if (answerMode === 'oral' && preparationTime && preparationTime > 0 && assessmentStarted) {
      setPrepSecondsLeft(preparationTime);
    } else {
      setPrepSecondsLeft(null);
      setPrepDone(true);
    }
  }, [currentQuestionIndex, assessmentStarted, answerMode, preparationTime]);

  // Prep countdown tick
  useEffect(() => {
    if (prepSecondsLeft === null || prepDone) return;
    if (prepSecondsLeft <= 0) {
      setPrepDone(true);
      setPrepSecondsLeft(null);
      return;
    }
    prepTimerRef.current = setInterval(() => {
      setPrepSecondsLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(prepTimerRef.current!);
          setPrepDone(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (prepTimerRef.current) clearInterval(prepTimerRef.current); };
  }, [prepSecondsLeft, prepDone]);

  const handleConsentAccepted = async () => {
    setIsRequestingPermission(true);
    try {
      await startProctoring();
      setConsentGiven(true);
      if (assessmentId) sessionStorage.setItem(`consent_${assessmentId}`, 'true');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleConsentDeclined = () => {
    // Allow assessment without proctoring (consent declined = proceed without camera)
    setConsentGiven(true);
    if (assessmentId) sessionStorage.setItem(`consent_${assessmentId}`, 'true');
  };

  const handleRestoreCamera = async () => {
    setIsRestoringCamera(true);
    try {
      await restoreProctoring();
    } finally {
      setIsRestoringCamera(false);
    }
  };

  const handleTimerExpire = async () => {
    const store = useAssessmentStore.getState();
    const { answerMode, isRecording, recordedBlob, textAnswer } = store;

    if (isRecording) {
      await store.stopRecording();
    }

    const state = useAssessmentStore.getState();

    if (answerMode === 'oral' && (recordedBlob || state.recordedBlob)) {
      addToast('Time\'s up! Submitting your audio answer.', 'warning');
      await handleSubmitAudioAnswer();
    } else if (answerMode === 'written' && textAnswer.trim().length >= 20) {
      addToast('Time\'s up! Submitting your written answer.', 'warning');
      await handleSubmitTextAnswer();
    } else {
      // Nothing to submit — skip with a marker so the server advances
      addToast('Time\'s up! Moving to the next question.', 'warning');
      await skipCurrentQuestion();
    }
  };

  const handleSubmitAudioAnswer = async () => {
    await submitCurrentAnswer();
    // Store re-fetches questions after submit — server advances the index
  };

  const handleSubmitTextAnswer = async () => {
    await submitCurrentTextAnswer();
  };

  const handleNext = () => {
    // No-op: store already re-fetches after submit and auto-advances via server index.
    // This button exists only as a visual affordance; the store drives navigation.
  };

  const handleSubmitAssessment = async () => {
    await submitCompleteAssessment();
    setShowSubmitModal(false);
    navigate(`/${studentId}/results/${assessmentId}`);
  };

  // Loading state
  if (isLoading && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading assessment..." />
      </div>
    );
  }

  // Error state
  if (error && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <ErrorMessage error={error} onDismiss={clearError} />
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // No questions state
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No Questions Available
          </h2>
          <p className="text-gray-600">
            This assessment doesn't have any questions yet.
          </p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Safety: if currentQuestionIndex is out of bounds, show a fallback
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Assessment Complete</h2>
          <p className="text-gray-600 mb-4">All questions have been answered.</p>
          <button
            onClick={() => navigate(`/${studentId}/results/${assessmentId}`)}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700"
          >
            View Results
          </button>
        </div>
      </div>
    );
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const answeredCount = progress?.answeredQuestions || 0;
  const currentAnswered = currentQuestion ? answeredQuestionIds.has(currentQuestion.id) : false;

  // Derive a minimal assessment object for the overview screen.
  // The store's `assessment` field is only populated if the backend returns metadata;
  // fall back to what we can derive from the loaded questions.
  const assessmentInfo = assessment ?? {
    id: assessmentId ?? '',
    title: 'Oral Assessment',
    course: '',
    description: '',
    dueDate: '',
    totalQuestions: questions.length,
    timeLimit: questions[0]?.timeLimit,
    status: 'open',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Consent modal — only shown once questions have loaded successfully */}
      {!consentGiven && questions.length > 0 && (
        <ConsentModal
          onConsent={handleConsentAccepted}
          onDecline={handleConsentDeclined}
          isRequestingPermission={isRequestingPermission}
        />
      )}

      {/* Pre-assessment overview — shown after consent, before question 1 */}
      {consentGiven && !assessmentStarted && (
        <PreAssessmentOverview
          assessment={assessmentInfo}
          questionCount={questions.length}
          onStart={() => setAssessmentStarted(true)}
        />
      )}

      {/* Main assessment UI — only rendered after the student clicks Start */}
      {assessmentStarted && <div>

      {/* Browser support error banner */}
      {browserError && (
        <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm">{browserError}</span>
          <button onClick={() => setBrowserError(null)} className="ml-4 text-red-200 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Camera revoked overlay */}
      {cameraRevoked && (
        <CameraRevokedOverlay
          onRestore={handleRestoreCamera}
          isRestoring={isRestoringCamera}
        />
      )}

      {/* Proctoring PiP */}
      <ProctorCamera stream={proctorStream} isRecording={isProctoringActive} />

      {/* Header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {assessment?.title ?? 'Oral Assessment'}
          </h1>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-600">
              Student {studentId}
            </p>
            <div className="flex items-center space-x-4">
              <div className="text-sm font-medium text-gray-700">
                Question {currentQuestionIndex + 1} of {questions.length}
              </div>
              {/* Per-question countdown timer — for oral, only starts after prep phase */}
              {(answerMode === 'written' || prepDone) && (
                <QuestionTimer
                  timeLimitSeconds={currentQuestion.timeLimit}
                  resetKey={`${currentQuestion.id}-${prepDone}`}
                  onExpire={handleTimerExpire}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Error Display */}
          {error && (
            <div className="mb-4">
              <ErrorMessage error={error} onDismiss={clearError} />
            </div>
          )}

          {/* Progress Tracker — display only, no navigation */}
          <div className="mb-4">
            <ProgressTracker
              currentIndex={currentQuestionIndex}
              totalQuestions={questions.length}
              answeredCount={answeredCount}
              questionIds={questions.map((q) => q.id)}
              answeredQuestionIds={answeredQuestionIds}
            />
          </div>

          {/* Question Display */}
          <div className="mb-4">
            <QuestionDisplay
              question={currentQuestion}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={questions.length}
            />
          </div>

          {/* Answer Panel — mode set by instructor */}
          <div className="mb-4">
            {answerMode === 'oral' ? (
              prepDone ? (
                <AudioRecorder
                  onSubmit={handleSubmitAudioAnswer}
                  timeLimit={currentQuestion.timeLimit ?? 300}
                />
              ) : (
                /* Preparation countdown */
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-8 text-center">
                  <p className="text-sm font-medium text-primary-700 mb-2">Preparation Time</p>
                  <div className="text-6xl font-bold text-primary-600 mb-4 tabular-nums">
                    {prepSecondsLeft !== null
                      ? `${Math.floor(prepSecondsLeft / 60)}:${String(prepSecondsLeft % 60).padStart(2, '0')}`
                      : '—'}
                  </div>
                  <p className="text-sm text-primary-600 mb-6">
                    Read the question carefully. Recording will start automatically when the timer ends.
                  </p>
                  <button
                    onClick={() => { setPrepDone(true); setPrepSecondsLeft(null); if (prepTimerRef.current) clearInterval(prepTimerRef.current); }}
                    className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                  >
                    I'm ready — Start Recording
                  </button>
                </div>
              )
            ) : (
              <TextAnswerInput
                value={textAnswer}
                onChange={setTextAnswer}
                onSubmit={handleSubmitTextAnswer}
                isSubmitting={isUploading}
              />
            )}
          </div>

          {/* Navigation — sequential only, no going back */}
          <div className={`flex justify-end items-center ${isProctoringActive ? 'pb-32' : 'pb-6'}`}>
            {isLastQuestion ? (
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={!currentAnswered}
                className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <span>Submit Assessment</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!currentAnswered}
                className="flex items-center space-x-2 bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Next Question</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Submit Assessment?
            </h2>
            <p className="text-gray-600 mb-2">
              You've answered{' '}
              <span className="font-semibold">{answeredCount}</span> out of{' '}
              <span className="font-semibold">{questions.length}</span> questions.
            </p>
            {answeredCount < questions.length && (
              <p className="text-orange-600 text-sm mb-4">
                {questions.length - answeredCount} question(s) are unanswered. You cannot return after submitting.
              </p>
            )}
            <p className="text-gray-500 text-sm mb-6">
              Once submitted, your assessment will be sent for evaluation.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAssessment}
                disabled={isLoading}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
              >
                {isLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>}{/* end assessmentStarted wrapper */}
    </div>
  );
}
