import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import QuestionDisplay from '../components/QuestionDisplay';
import ProgressTracker from '../components/ProgressTracker';
import AudioRecorder from '../components/AudioRecorder';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { parseUrlParams, checkBrowserSupport } from '../utils/helpers';

export default function TakeAssessment() {
  const navigate = useNavigate();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  
  const {
    studentId,
    assessmentId,
    questions,
    currentQuestionIndex,
    progress,
    isLoading,
    error,
    setStudentInfo,
    loadQuestions,
    loadProgress,
    nextQuestion,
    previousQuestion,
    submitCurrentAnswer,
    submitCompleteAssessment,
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

  const handleSubmitAnswer = async () => {
    await submitCurrentAnswer();
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
            <div className="text-sm font-medium text-gray-700">
              Question {currentQuestionIndex + 1} of {questions.length}
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

          {/* Audio Recorder */}
          <div className="mb-4">
            <AudioRecorder
              onSubmit={handleSubmitAnswer}
              timeLimit={300}
            />
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center pb-6">
          <button
            onClick={handlePrevious}
            disabled={isFirstQuestion}
            className="flex items-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
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
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span>Next</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
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
            <p className="text-gray-600 mb-6">
              Are you sure you want to submit this assessment? You've answered{' '}
              {answeredCount} out of {questions.length} questions.
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
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
