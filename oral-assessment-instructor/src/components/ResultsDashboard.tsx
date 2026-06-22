import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';

interface ResultsDashboardProps {
  assessmentId: string;
  evalJobId?: string;
}

// completedAt is null for enrolled-but-unsubmitted students; `new Date(null)` is
// epoch 1970 ("56 years ago"), so guard before formatting and show a dash instead.
function isValidDate(value: unknown): value is string | number | Date {
  if (value === null || value === undefined || value === '') return false;
  return !Number.isNaN(new Date(value as string | number | Date).getTime());
}

export default function ResultsDashboard({ assessmentId, evalJobId }: ResultsDashboardProps) {
  const navigate = useNavigate();
  const { results, setResults, progress, setProgress, isLoading, setLoading, setError } = useAssessmentStore();

  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [resultsReleased, setResultsReleased] = useState<boolean | null>(null);
  const [flagged, setFlagged] = useState<{ flaggedCount: number; items: Array<{ studentId: string; questionId: string; reasons: string[]; aiScore?: number; evaluationMethod?: string }> } | null>(null);
  const [agreement, setAgreement] = useState<{ dualScoredCount: number; exactMatchRate: number | null; within1Rate: number | null; meanAbsoluteDifference: number | null } | null>(null);
  const [showFlagged, setShowFlagged] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const loadFlagged = async () => {
    try {
      setFlagged(await apiService.getFlaggedEvaluations(assessmentId));
    } catch { /* non-critical */ }
  };

  const loadAgreement = async () => {
    try {
      setAgreement(await apiService.getScoreAgreement(assessmentId));
    } catch { /* non-critical */ }
  };

  const loadReleasedState = async () => {
    try {
      const assessment = await apiService.getAssessment(assessmentId);
      setResultsReleased(assessment.resultsReleased ?? false);
    } catch { /* non-critical */ }
  };

  const loadProgress = async () => {
    try {
      const students = await apiService.getAssessmentProgress(assessmentId);
      setProgress(students);
    } catch { /* non-critical */ }
  };

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.getAssessmentResults(assessmentId);
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Intentional reset-on-key-change: clear stale results/release state when
    // switching assessments before the async loaders below refetch them.
    setResults([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResultsReleased(null);
    loadResults();
    loadReleasedState();
    loadProgress();
    loadFlagged();
    loadAgreement();
  }, [assessmentId]);

  useEffect(() => {
    if (!evalJobId) return;
    const es = apiService.openEvaluationStatusStream(assessmentId, evalJobId);
    sseRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'completed') {
          loadResults();
          es.close();
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [evalJobId]);

  const handleReleaseResults = async () => {
    try {
      setIsReleasing(true);
      setReleaseMessage(null);
      await apiService.releaseResults(assessmentId);
      setResultsReleased(true);
      setReleaseMessage('Results released to students.');
    } catch (err) {
      setReleaseMessage(err instanceof Error ? err.message : 'Failed to release results');
    } finally {
      setIsReleasing(false);
    }
  };

  const getGradeBadgeColor = (grade: string) => {
    const colors: Record<string, string> = {
      Excellent: 'bg-green-100 text-green-800',
      Competent: 'bg-blue-100 text-blue-800',
      Developing: 'bg-yellow-100 text-yellow-800',
      Unsatisfactory: 'bg-red-100 text-red-800',
    };
    return colors[grade] || 'bg-gray-100 text-gray-800';
  };

  const resultsArray = Array.isArray(results) ? results : [];

  const submittedCount = progress.filter(
    (s) => s.status === 'completed' || s.status === 'submitted'
  ).length;
  const evaluatedCount = resultsArray.length;
  const hasUnevaluated = submittedCount > 0 && evaluatedCount < submittedCount;

  const gradeCounts = resultsArray.reduce((acc, r) => {
    acc[r.grade] = (acc[r.grade] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const gradeSummary = Object.entries(gradeCounts).map(([g, c]) => `${c} ${g}`).join(', ');

  if (isLoading && results.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (!isLoading && results.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Results Available</h3>
        <p className="text-gray-500">Results will appear here once students complete the assessment and evaluations are processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Release Results */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {resultsReleased ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700">Results Released</p>
              <p className="text-xs text-gray-500">Students can view their scores and feedback.</p>
            </div>
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-800">Released</span>
          </div>
        ) : showReleaseConfirm ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-900">Confirm release?</p>
            <p className="text-xs text-gray-500">This will make scores and feedback visible to all students immediately.</p>
            {hasUnevaluated && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <p className="text-sm text-amber-800 font-medium">
                  Only {evaluatedCount} of {submittedCount} submitted students have been evaluated.
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Students without evaluations will see no results.
                </p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={async () => { await handleReleaseResults(); setShowReleaseConfirm(false); }}
                disabled={isReleasing}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isReleasing ? 'Releasing…' : 'Confirm Release'}
              </button>
              <button onClick={() => setShowReleaseConfirm(false)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Release Results to Students</p>
              {releaseMessage && <p className="text-xs text-green-600 mt-1">{releaseMessage}</p>}
            </div>
            <button
              onClick={() => setShowReleaseConfirm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Release Results
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      {gradeSummary && (
        <p className="text-sm text-gray-600">{resultsArray.length} students evaluated — {gradeSummary}</p>
      )}

      {/* Review & validity (Tasks 3 & 5) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">Flagged for review</p>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${flagged && flagged.flaggedCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {flagged ? flagged.flaggedCount : '—'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Evaluations needing a human glance before release (low confidence, AI fallback, or divergent scores).
          </p>
          {flagged && flagged.flaggedCount > 0 && (
            <button onClick={() => setShowFlagged(v => !v)} className="mt-2 text-xs text-primary-600 hover:underline">
              {showFlagged ? 'Hide flagged items' : 'View flagged items'}
            </button>
          )}
          {showFlagged && flagged && (
            <ul className="mt-2 max-h-44 overflow-y-auto text-xs text-gray-600 space-y-1">
              {flagged.items.map((it, idx) => (
                <li key={`${it.studentId}-${it.questionId}-${idx}`} className="flex items-center justify-between gap-2">
                  <button
                    className="text-primary-600 hover:underline truncate"
                    onClick={() => navigate(`/assessments/${assessmentId}/student/${it.studentId}/results`)}
                  >
                    {it.studentId}
                  </button>
                  <span className="text-gray-400 truncate">{it.reasons.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-900">AI vs human agreement</p>
          {agreement && agreement.dualScoredCount > 0 ? (
            <div className="mt-1 text-xs text-gray-600 space-y-0.5">
              <p>Dual-scored items: <span className="font-medium text-gray-900">{agreement.dualScoredCount}</span></p>
              <p>Exact match: <span className="font-medium text-gray-900">{agreement.exactMatchRate != null ? `${(agreement.exactMatchRate * 100).toFixed(0)}%` : '—'}</span></p>
              <p>Within 1 mark: <span className="font-medium text-gray-900">{agreement.within1Rate != null ? `${(agreement.within1Rate * 100).toFixed(0)}%` : '—'}</span></p>
              <p>Mean abs. difference: <span className="font-medium text-gray-900">{agreement.meanAbsoluteDifference != null ? agreement.meanAbsoluteDifference.toFixed(2) : '—'}</span></p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              No human reference scores recorded yet. Enter human scores on a student's detail page to measure agreement.
            </p>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {resultsArray.map((result) => (
              <tr key={result.studentId} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/assessments/${assessmentId}/student/${result.studentId}/results`)}>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{result.name ?? result.studentId}</div>
                  <div className="text-xs text-gray-500">{result.email ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {result.totalScore}/{result.maxScore} ({result.percentage}%)
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getGradeBadgeColor(result.grade)}`}>{result.grade}</span>
                </td>
                <td
                  className="px-4 py-3 text-sm text-gray-500"
                  title={isValidDate(result.completedAt) ? new Date(result.completedAt).toLocaleString() : undefined}
                >
                  {isValidDate(result.completedAt)
                    ? formatDistanceToNow(new Date(result.completedAt), { addSuffix: true })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-primary-600 text-sm">View →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
