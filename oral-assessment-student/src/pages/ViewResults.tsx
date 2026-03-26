import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import ResultsCard from '../components/ResultsCard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import {
  getBandGradeColor,
  formatTimestamp,
} from '../utils/helpers';

export default function ViewResults() {
  const { studentId: urlStudentId, assessmentId: urlAssessmentId } = useParams<{
    studentId: string;
    assessmentId: string;
  }>();

  const {
    studentId,
    assessmentId,
    results,
    isResultsReady,
    isLoading,
    error,
    setStudentInfo,
    loadResults,
    clearError,
  } = useAssessmentStore();

  // Initialize and load results
  useEffect(() => {
    if (urlStudentId && urlAssessmentId) {
      setStudentInfo(urlStudentId, urlAssessmentId);
    }
  }, [urlStudentId, urlAssessmentId, setStudentInfo]);

  useEffect(() => {
    if (studentId && assessmentId && !isResultsReady) {
      loadResults();
    }
  }, [studentId, assessmentId, isResultsReady, loadResults]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading results..." />
      </div>
    );
  }

  // Error state
  if (error) {
    const isNotReleased = error.message?.toLowerCase().includes('not released');
    const isPending = error.message?.toLowerCase().includes('not ready') || error.message?.toLowerCase().includes('not available');
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {isNotReleased ? (
            <div className="p-6 bg-primary-50 border border-primary-200 rounded-lg text-center">
              <svg className="mx-auto h-12 w-12 text-primary-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-lg font-semibold text-primary-900 mb-2">Results Pending Release</h2>
              <p className="text-sm text-primary-700">Your results are ready but have not yet been released by your instructor. Check back soon!</p>
            </div>
          ) : (
            <>
              <ErrorMessage error={error} onDismiss={clearError} />
              {isPending && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    Your assessment is being evaluated. This usually takes a few minutes. Please check back soon!
                  </p>
                </div>
              )}
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
        <div className="text-center">
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

  const handleDownloadPdf = () => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    const url = `${API_BASE_URL}/api/student/${studentId}/assessment/${assessmentId}/results/pdf${token ? `?token=${token}` : ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assessment Results</h1>
              <p className="text-sm text-gray-600 mt-1">
                Student: {studentId}
              </p>
            </div>
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
                {results.completedAt && (
                  <>
                    <div className="text-sm font-medium text-gray-700">{formatTimestamp(results.completedAt)}</div>
                    <div className="text-sm text-gray-600">Completed</div>
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

        {/* Summary */}
        <div className="mt-8 bg-primary-50 border border-primary-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-primary-900 mb-2">
            What's Next?
          </h3>
          <p className="text-blue-800">
            Review the feedback for each question to understand your strengths and areas for improvement.
            Focus on the suggested improvements to enhance your understanding.
          </p>
        </div>
      </main>
    </div>
  );
}
