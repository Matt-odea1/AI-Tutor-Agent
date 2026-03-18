import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import QuestionDisplay from '../components/QuestionDisplay';
import ProgressTracker from '../components/ProgressTracker';
import AudioRecorder from '../components/AudioRecorder';
import VideoRecorder from '../components/VideoRecorder';
import TextAnswerInput from '../components/TextAnswerInput';
import QuestionTimer from '../components/QuestionTimer';
import ConsentModal from '../components/ConsentModal';
import ProctorCamera from '../components/ProctorCamera';
import CameraRevokedOverlay from '../components/CameraRevokedOverlay';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { parseUrlParams, checkBrowserSupport } from '../utils/helpers';

export default function TakeAssessment() {
  const navigate = useNavigate();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isRestoringCamera, setIsRestoringCamera] = useState(false);

  const {
    studentId,
    assessmentId,
    questions,
    currentQuestionIndex,
    progress,
    isLoading,
    isUploading,
    error,
    answerMode,
    textAnswer,
    proctorStream,
    isProctoringActive,
    cameraRevoked,
    consentGiven,
    setStudentInfo,
    loadQuestions,
    loadProgress,
    nextQuestion,
    previousQuestion,
    submitCurrentAnswer,
    submitCurrentTextAnswer,
    submitCurrentVideoAnswer,
    submitCompleteAssessment,
    setAnswerMode,
    setTextAnswer,
    setConsentGiven,
    startProctoring,
    restoreProctoring,
    clearError,
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

  // Check browser support
  useEffect(() => {
    const { supported, missing } = checkBrowserSupport();
    if (!supported) {
      alert(
        `Your browser is missing required features: ${missing.join(', ')}. ` +
        'Please use a modern browser like Chrome, Firefox, or Safari.'
      );
    }
  }, []);

  const handleConsentAccepted = async () => {
    setIsRequestingPermission(true);
    try {
      await startProctoring();
      setConsentGiven(true);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleConsentDeclined = () => {
    // Allow assessment without proctoring (consent declined = proceed without camera)
    setConsentGiven(true);
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
    // Grace period: show a brief notification then auto-submit/advance
    const { answerMode, recordedBlob, videoBlob, textAnswer, currentQuestionIndex, questions } = useAssessmentStore.getState();

    if (answerMode === 'audio' && recordedBlob) {
      await submitCurrentAnswer();
    } else if (answerMode === 'video' && videoBlob) {
      await submitCurrentVideoAnswer();
    } else if (answerMode === 'text' && textAnswer.trim().length >= 20) {
      await submitCurrentTextAnswer();
    } else {
      // Nothing to submit — just advance
      if (currentQuestionIndex < questions.length - 1) {
        nextQuestion();
      }
    }
  };

  const handleSubmitAudioAnswer = async () => {
    await submitCurrentAnswer();
  };

  const handleSubmitTextAnswer = async () => {
    await submitCurrentTextAnswer();
  };

  const handleSubmitVideoAnswer = async () => {
    await submitCurrentVideoAnswer();
  };

  const handleNext = () => {
    nextQuestion();
  };

  const handlePrevious = () => {
    previousQuestion();
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
            className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
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
  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const answeredCount = progress?.answeredQuestions || 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Consent modal — shown once before assessment begins */}
      {!consentGiven && (
        <ConsentModal
          onConsent={handleConsentAccepted}
          onDecline={handleConsentDeclined}
          isRequestingPermission={isRequestingPermission}
        />
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
            Oral Assessment
          </h1>
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-gray-600">
              Student: {studentId} | Assessment: {assessmentId?.slice(0, 8)}...
            </p>
            <div className="flex items-center space-x-4">
              <div className="text-sm font-medium text-gray-700">
                Question {currentQuestionIndex + 1} of {questions.length}
              </div>
              {/* Per-question countdown timer */}
              <QuestionTimer
                timeLimitSeconds={currentQuestion.timeLimit}
                resetKey={currentQuestion.id}
                onExpire={handleTimerExpire}
              />
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

          {/* Progress Tracker */}
          <div className="mb-4">
            <ProgressTracker
              currentIndex={currentQuestionIndex}
              totalQuestions={questions.length}
              answeredCount={answeredCount}
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

          {/* Answer Mode Tabs */}
          <div className="mb-4">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
              {/* Oral Answer tab */}
              <button
                onClick={() => setAnswerMode('audio')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  answerMode === 'audio'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd" />
                </svg>
                <span>Oral Answer</span>
              </button>

              {/* Video Answer tab */}
              <button
                onClick={() => setAnswerMode('video')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  answerMode === 'video'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Video Answer</span>
              </button>

              {/* Written Answer tab */}
              <button
                onClick={() => setAnswerMode('text')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  answerMode === 'text'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Written Answer</span>
              </button>
            </div>
          </div>

          {/* Answer Panel */}
          <div className="mb-4">
            {answerMode === 'audio' && (
              <AudioRecorder
                onSubmit={handleSubmitAudioAnswer}
                timeLimit={currentQuestion.timeLimit ?? 300}
              />
            )}
            {answerMode === 'video' && (
              <VideoRecorder
                onSubmit={handleSubmitVideoAnswer}
                timeLimit={currentQuestion.timeLimit ?? 300}
              />
            )}
            {answerMode === 'text' && (
              <TextAnswerInput
                value={textAnswer}
                onChange={setTextAnswer}
                onSubmit={handleSubmitTextAnswer}
                isSubmitting={isUploading}
              />
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pb-6">
            <button
              onClick={handlePrevious}
              disabled={isFirstQuestion}
              className="flex items-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd" />
              </svg>
              <span>Previous</span>
            </button>

            {isLastQuestion ? (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="flex items-center space-x-2 bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
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
                className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <span>Next</span>
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
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
    </div>
  );
}
