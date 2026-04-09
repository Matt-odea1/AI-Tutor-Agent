import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import ResultsCard from '../components/ResultsCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import {
  getBandGradeColor,
  formatTimestamp,
} from '../utils/helpers';

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
    isLoading,
    error,
    setStudentInfo,
    loadQuestions,
    loadResults,
    loadProgress,
    clearError,
  } = useAssessmentStore();

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

  useEffect(() => {
    if (studentId && assessmentId && !isResultsReady) {
      if (!progress || progress.status === 'submitted') {
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

  // Auto-poll every 8s while results are pending (evaluation running or not yet released)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isResultsReady) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    if (!studentId || !assessmentId) return;
    if (progress && progress.status !== 'submitted') return;

    pollRef.current = setInterval(() => {
      loadResults();
    }, 8000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isResultsReady, studentId, assessmentId, progress, loadResults]);

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

  // Loading state
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

  // Error state
  if (error) {
    const errorMsg = (error.message ?? '').toLowerCase();
    const isNotReleased = error.status === 403 || errorMsg.includes('not released') || errorMsg.includes('pending release');
    const isPending = error.status === 202 || errorMsg.includes('not ready') || errorMsg.includes('not available') || errorMsg.includes('pending') || errorMsg.includes('being evaluated');
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
          ) : isPending ? (
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
            onClick={() => loadResults()}
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
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const token = sessionStorage.getItem('studentToken');
    const url = `${API_BASE_URL}/api/student/${studentId}/assessment/${assessmentId}/results/pdf`;
    try {
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `results-${assessmentId}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      alert('Failed to download PDF. Please try again.');
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

        {/* Download PDF */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={handleDownloadPdf}
            className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Results as PDF
          </button>
        </div>

      </main>
    </div>
  );
}
