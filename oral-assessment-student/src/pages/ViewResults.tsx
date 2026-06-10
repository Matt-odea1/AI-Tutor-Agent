import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { useToastStore } from '../store/toastStore';
import { getResultsPdf } from '../services/api';
import ResultsCard from '../components/ResultsCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import {
  getBandGradeColor,
  formatTimestamp,
} from '../utils/helpers';
import { isResultsNotReleasedError } from '../utils/resultHelpers';

// Auto-poll cadence and cap. ~15 background polls × 8s ≈ 2 minutes before we
// stop and hand control back to the student with a manual "Check again".
const POLL_INTERVAL_MS = 8000;
const MAX_RESULT_POLLS = 15;

export default function ViewResults() {
  const navigate = useNavigate();
  const { studentId: urlStudentId, assessmentId: urlAssessmentId } = useParams<{
    studentId: string;
    assessmentId: string;
  }>();

  const {
    studentId,
    assessmentId,
    assessment,
    progress,
    results,
    isResultsReady,
    isResultsPending,
    resultsPollExhausted,
    isLoading,
    error,
    setStudentInfo,
    loadQuestions,
    loadResults,
    loadProgress,
    clearError,
    resetResultsPolling,
    setResultsPollExhausted,
  } = useAssessmentStore();

  const addToast = useToastStore((state) => state.addToast);

  // Initialize and load results
  useEffect(() => {
    if (urlStudentId && urlAssessmentId) {
      setStudentInfo(urlStudentId, urlAssessmentId);
    }
  }, [urlStudentId, urlAssessmentId, setStudentInfo]);

  // Load progress first to check submission status
  useEffect(() => {
    if (studentId && assessmentId && !progress) {
      loadProgress();
    }
  }, [studentId, assessmentId, progress, loadProgress]);

  // First (foreground) results fetch — exactly once. Background polling (below)
  // takes over afterwards so the full-screen spinner only ever shows on first load.
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    if (studentId && assessmentId && !isResultsReady) {
      if (!progress || progress.status === 'submitted') {
        initialLoadDoneRef.current = true;
        loadResults();
      }
    }
  }, [studentId, assessmentId, isResultsReady, progress, loadResults]);

  // Load assessment metadata (title, course) if not already in store
  useEffect(() => {
    if (studentId && assessmentId && !assessment) {
      loadQuestions().catch(() => {
        // Silently ignore — metadata is best-effort for display
      });
    }
  }, [studentId, assessmentId, assessment, loadQuestions]);

  // Auto-poll while results are pending. Polls run in the BACKGROUND (no global
  // isLoading), so the "Evaluating Your Assessment" panel stays put with no
  // spinner flicker. Stops when results arrive OR the attempt cap is reached.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isResultsReady || resultsPollExhausted) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (!studentId || !assessmentId) return;
    if (progress && progress.status !== 'submitted') return;

    pollRef.current = setInterval(() => {
      if (useAssessmentStore.getState().resultsPollCount >= MAX_RESULT_POLLS) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setResultsPollExhausted(true);
        return;
      }
      loadResults({ background: true });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isResultsReady, resultsPollExhausted, studentId, assessmentId, progress, loadResults, setResultsPollExhausted]);

  const handleCheckAgain = () => {
    initialLoadDoneRef.current = true; // initial load already happened; this is a manual retry
    resetResultsPolling();
    loadResults();
  };

  // Shared assessment header for pending/error states
  const assessmentHeader = assessment ? (
    <div className="text-center mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{assessment.title}</h1>
      {assessment.course && (
        <p className="text-gray-500 mt-1">{assessment.course}</p>
      )}
    </div>
  ) : null;

  // Guard: if progress loaded and assessment not submitted, redirect to assessment
  if (progress && progress.status !== 'submitted') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          {assessmentHeader}
          <svg className="mx-auto h-12 w-12 text-yellow-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Assessment Not Submitted</h2>
          <p className="text-sm text-gray-600 mb-4">You need to complete and submit the assessment before viewing results.</p>
          <button
            onClick={() => navigate(`/${studentId}/${assessmentId}`)}
            className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700"
          >
            Return to Assessment
          </button>
        </div>
      </div>
    );
  }

  // Loading state — first foreground fetch only (background polls never set isLoading)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {assessmentHeader}
          <div className="flex justify-center">
            <LoadingSpinner size="lg" message="Loading results..." />
          </div>
        </div>
      </div>
    );
  }

  // Polling exhausted — grading is taking longer than expected. Offer a manual retry.
  if (resultsPollExhausted && !isResultsReady && !results) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {assessmentHeader}
          <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
            <svg className="mx-auto h-12 w-12 text-yellow-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-yellow-900 mb-2">This is taking longer than expected</h2>
            <p className="text-sm text-yellow-800 mb-4">
              Your assessment is still being evaluated. You can safely close this page and come back
              later, or check again now.
            </p>
            <button
              onClick={handleCheckAgain}
              className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700"
            >
              Check again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error / pending states
  if (error) {
    // `isResultsPending` (store) is the single source of truth for "still pending";
    // the error message only refines WHICH pending panel (not-released vs evaluating).
    const isNotReleased = isResultsNotReleasedError(error);
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {assessmentHeader}
          {isNotReleased ? (
            <div className="p-6 bg-primary-50 border border-primary-200 rounded-lg text-center">
              <svg className="mx-auto h-12 w-12 text-primary-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-lg font-semibold text-primary-900 mb-2">Results Pending Release</h2>
              <p className="text-sm text-primary-700">Your results are ready but have not yet been released by your instructor.</p>
              <p className="text-xs text-primary-500 mt-2">This page will update automatically.</p>
            </div>
          ) : isResultsPending ? (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <div className="mx-auto h-12 w-12 mb-3 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
              </div>
              <h2 className="text-lg font-semibold text-yellow-900 mb-2">Evaluating Your Assessment</h2>
              <p className="text-sm text-yellow-800">Your assessment is being evaluated.</p>
              <p className="text-sm text-yellow-700 mt-1">This usually takes 2–5 minutes depending on the number of questions.</p>
              <p className="text-xs text-yellow-600 mt-2">This page will update automatically.</p>
            </div>
          ) : (
            <>
              <ErrorMessage error={error} onDismiss={clearError} />
              <button onClick={() => loadResults()} className="mt-4 w-full bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // No results state
  if (!results) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          {assessmentHeader}
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No Results Available
          </h2>
          <p className="text-gray-600 mb-4">
            Results for this assessment are not available yet.
          </p>
          <button
            onClick={handleCheckAgain}
            className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700"
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  const grade = results.grade;
  const gradeColorClass = getBandGradeColor(grade);

  const handleDownloadPdf = async () => {
    if (!studentId || !assessmentId) return;
    try {
      const blob = await getResultsPdf(studentId, assessmentId);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `results-${assessmentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      addToast('Failed to download PDF. Please try again.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Assessment Results</h1>
            <button
              onClick={handleDownloadPdf}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Download PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* AI-grading disclosure */}
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
          <svg className="h-5 w-5 flex-shrink-0 text-gray-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>
            Scores and feedback are AI-generated. If you believe a result is incorrect, contact your
            instructor.
          </p>
        </div>

        {/* Overall Score Card */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <div className="text-center">
            {/* Score, percentage, and grade as a single coherent unit */}
            <div className="mb-6">
              <div className="text-5xl font-bold text-gray-900 mb-1">
                {results.totalScore} / {results.maxScore}
              </div>
              <div className="text-2xl text-gray-600 mb-3">
                ({results.percentage}%)
              </div>
              <div className={`inline-block px-6 py-2 rounded-full text-xl font-semibold ${gradeColorClass}`}>
                {grade}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-6 border-t">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {results.questions.length}
                </div>
                <div className="text-sm text-gray-600">Questions</div>
              </div>
              <div>
                {(results.completedAt || results.submittedAt) && (
                  <>
                    <div className="text-sm font-medium text-gray-700">{formatTimestamp(results.completedAt || results.submittedAt || '')}</div>
                    <div className="text-sm text-gray-600">Submitted</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Question Results */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Question Details
          </h2>
          <div className="space-y-4">
            {results.questions.map((questionResult) => (
              <ResultsCard
                key={questionResult.questionId}
                result={questionResult}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
