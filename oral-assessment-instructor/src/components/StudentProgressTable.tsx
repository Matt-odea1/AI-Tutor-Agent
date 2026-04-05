import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { StudentProgress, Student } from '../../../shared/types/assessment';

interface EvalProgress {
  questionsEvaluated: number;
  totalQuestions: number;
  percentage: number;
  status: string; // 'evaluating' | 'completed' | 'failed' | 'not_started'
}

interface StudentProgressTableProps {
  assessmentId: string;
}

type StudentProgressWithInfo = StudentProgress & {
  student: Student;
};

export default function StudentProgressTable({ assessmentId }: StudentProgressTableProps) {
  const { progress, setProgress, students, setStudents, setLoading, setError } = useAssessmentStore();
  
  const [filteredProgress, setFilteredProgress] = useState<StudentProgressWithInfo[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluatingSingle, setEvaluatingSingle] = useState<Record<string, boolean>>({});
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState<string | null>(null);
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const STUDENT_APP_URL = (() => {
    const envUrl = import.meta.env.VITE_STUDENT_APP_URL;
    if (!envUrl) {
      console.warn('VITE_STUDENT_APP_URL is not set — falling back to window.location.origin for student links');
    }
    return envUrl || window.location.origin;
  })();
  const EVAL_DONE_KEY = `evalDone:${assessmentId}`;
  const [evalProgress, setEvalProgress] = useState<Record<string, EvalProgress>>(() => {
    // Restore completed evaluations from localStorage
    try {
      const stored = localStorage.getItem(EVAL_DONE_KEY);
      const doneIds: string[] = stored ? JSON.parse(stored) : [];
      return Object.fromEntries(
        doneIds.map(id => [id, { questionsEvaluated: 1, totalQuestions: 1, percentage: 100, status: 'completed' }])
      );
    } catch {
      return {};
    }
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const evalStreams = useRef<Record<string, EventSource>>({});
  const INACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  // Load initial data (reset stale data first to avoid showing previous assessment's state)
  useEffect(() => {
    setProgress([]);
    setStudents([]);
    loadProgressData();
    loadStudents();
  }, [assessmentId]);

  // Poll for progress updates every 10s
  useEffect(() => {
    startPolling();
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    };
  }, [assessmentId]);

  // Apply filters when data changes
  useEffect(() => {
    applyFilters();
  }, [progress, students, statusFilter, searchQuery]);

  // Tick the "last updated" counter every second
  useEffect(() => {
    const ticker = setInterval(() => {
      if (lastUpdated) {
        setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  const loadProgressData = async () => {
    try {
      setLoading(true);
      setError(null);
      const progressData = await apiService.getAssessmentProgress(assessmentId);
      setProgress(Array.isArray(progressData) ? progressData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const studentsData = await apiService.getAssessmentStudents(assessmentId);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
    } catch (err) {
      console.error('Error loading students:', err);
    }
  };

  const startPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    const interval = setInterval(async () => {
      try {
        const progressData = await apiService.getAssessmentProgress(assessmentId);
        setProgress(Array.isArray(progressData) ? progressData : []);
        setLastUpdated(new Date());
        setSecondsSinceUpdate(0);
      } catch (err) {
        console.error('Error polling progress:', err);
      }
    }, 10_000);
    setPollingInterval(interval);
  };

  const applyFilters = () => {
    // Ensure progress is an array
    const progressArray = Array.isArray(progress) ? progress : [];
    const studentsArray = Array.isArray(students) ? students : [];
    
    let filtered = progressArray.map(p => {
      const student = studentsArray.find(s => s.studentId === p.studentId);
      return { ...p, student: student || { id: p.studentId, name: p.studentId, email: '', studentId: p.studentId } };
    });

    // Status filter
    if (statusFilter === 'done') {
      filtered = filtered.filter(p => p.status === 'completed' || p.status === 'submitted');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.student.name.toLowerCase().includes(query) ||
        p.student.email.toLowerCase().includes(query) ||
        p.student.studentId.toLowerCase().includes(query)
      );
    }

    setFilteredProgress(filtered);
  };

  const openEvalProgressStream = (studentId: string) => {
    if (evalStreams.current[studentId]) evalStreams.current[studentId].close();
    const es = apiService.openStudentEvaluationProgressStream(assessmentId, studentId);
    evalStreams.current[studentId] = es;
    es.onmessage = (event) => {
      try {
        const data: EvalProgress = JSON.parse(event.data);
        setEvalProgress(prev => ({ ...prev, [studentId]: data }));
        if (data.status === 'completed') {
          // Persist to localStorage so Evaluate button stays hidden after refresh
          try {
            const stored = localStorage.getItem(EVAL_DONE_KEY);
            const doneIds: string[] = stored ? JSON.parse(stored) : [];
            if (!doneIds.includes(studentId)) {
              localStorage.setItem(EVAL_DONE_KEY, JSON.stringify([...doneIds, studentId]));
            }
          } catch { /* ignore storage errors */ }
          es.close();
          delete evalStreams.current[studentId];
        } else if (data.status === 'failed') {
          es.close();
          delete evalStreams.current[studentId];
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      delete evalStreams.current[studentId];
      // Re-open the stream after a brief delay if evaluation was still in progress
      const lastProgress = evalProgress[studentId];
      if (lastProgress && lastProgress.status === 'evaluating') {
        setTimeout(() => openEvalProgressStream(studentId), 3000);
      }
    };
  };

  // Close all eval streams on unmount
  useEffect(() => {
    return () => {
      Object.values(evalStreams.current).forEach(es => es.close());
    };
  }, []);

  const handleEvaluateAll = async () => {
    // Ensure progress is an array
    const progressArray = Array.isArray(progress) ? progress : [];

    const completedStudents = progressArray
      .filter(p => p.status === 'completed')
      .map(p => p.studentId);

    if (completedStudents.length === 0) {
      setError('No completed assessments to evaluate');
      return;
    }

    try {
      setIsEvaluating(true);
      setLoading(true);
      setError(null);
      await apiService.evaluateAssessment(assessmentId, completedStudents);
      setError(null);
      // Open per-student progress streams
      completedStudents.forEach(sid => openEvalProgressStream(sid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start evaluation');
    } finally {
      setIsEvaluating(false);
      setLoading(false);
    }
  };

  const handleEvaluateSingle = async (studentId: string) => {
    setEvaluatingSingle(prev => ({ ...prev, [studentId]: true }));
    try {
      await apiService.evaluateAssessment(assessmentId, [studentId]);
      openEvalProgressStream(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start evaluation');
    } finally {
      setEvaluatingSingle(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleCopyLink = async (studentId: string) => {
    const link = `${STUDENT_APP_URL}/${studentId}/${assessmentId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedStudentId(studentId);
    setTimeout(() => setCopiedStudentId(null), 2000);
  };

  const handleSendReminder = async (studentId: string) => {
    setSendingReminder(studentId);
    try {
      await apiService.sendReminder(assessmentId, studentId);
      setReminderSent(studentId);
      setTimeout(() => setReminderSent(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };

  const handleSendInvites = async () => {
    setIsSendingInvites(true);
    setInviteResult(null);
    try {
      const result = await apiService.sendInvites(assessmentId);
      setInviteResult(`Sent ${result.sent} invite${result.sent !== 1 ? 's' : ''}${result.skipped > 0 ? ` (${result.skipped} skipped — no email)` : ''}`);
      setTimeout(() => setInviteResult(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setIsSendingInvites(false);
    }
  };

  const isInactive = (p: StudentProgress): boolean => {
    if (p.status === 'completed' || p.status === 'submitted') return false;
    const startedAt = p.startedAt;
    if (!startedAt) return false;
    return Date.now() - new Date(startedAt).getTime() > INACTIVE_THRESHOLD_MS;
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      'not-started': 'bg-gray-200 text-gray-700',
      'in-progress': 'bg-yellow-600 text-white',
      'completed': 'bg-green-600 text-white',
      'submitted': 'bg-blue-600 text-white',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-200 text-gray-700';
  };

  const getStatusText = (status: string) => {
    const texts = {
      'not-started': 'Not Started',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'submitted': 'Submitted',
    };
    return texts[status as keyof typeof texts] || status;
  };

  const getProgressPercentage = (p: StudentProgress) => {
    return p.totalQuestions > 0 ? Math.round((p.questionsAnswered / p.totalQuestions) * 100) : 0;
  };

  // Ensure progress is an array for stats calculation
  const progressArray = Array.isArray(progress) ? progress : [];
  
  const stats = {
    total: progressArray.length,
    notStarted: progressArray.filter(p => p.status === 'not-started').length,
    inProgress: progressArray.filter(p => p.status === 'in-progress').length,
    completed: progressArray.filter(p => p.status === 'completed' || p.status === 'submitted').length,
  };
  const evaluatedCount = Object.values(evalProgress).filter(e => e.status === 'completed').length;
  const allSubmitted = stats.total > 0 && stats.completed === stats.total;
  const allEvaluated = stats.completed > 0 && evaluatedCount >= stats.completed;

  // Assessment phase status
  const assessmentPhase = allEvaluated ? 'Evaluated' : allSubmitted ? 'All Submitted' : stats.inProgress > 0 ? 'In Progress' : stats.notStarted === stats.total ? 'Not Started' : 'Open';
  const phaseColors: Record<string, string> = {
    'Not Started': 'bg-gray-100 text-gray-700',
    'Open': 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-yellow-100 text-yellow-800',
    'All Submitted': 'bg-green-100 text-green-800',
    'Evaluated': 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="space-y-6">
      {/* Status Pill + Stats Cards */}
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${phaseColors[assessmentPhase] || 'bg-gray-100 text-gray-700'}`}>
          {assessmentPhase}
        </span>
        {evaluatedCount > 0 && (
          <span className="text-sm text-gray-500">{evaluatedCount} of {stats.completed} evaluated</span>
        )}
      </div>

      {/* CTA Banners */}
      {allSubmitted && !allEvaluated && !isEvaluating && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-green-800 font-medium">All {stats.total} students have submitted.</p>
            <p className="text-green-700 text-sm">Run evaluation to generate scores and feedback.</p>
          </div>
          <button
            onClick={handleEvaluateAll}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            Run Evaluation
          </button>
        </div>
      )}

      {stats.total > 0 && stats.notStarted > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-blue-800 font-medium">{stats.notStarted} student{stats.notStarted !== 1 ? 's haven\'t' : ' hasn\'t'} started yet.</p>
            <p className="text-blue-700 text-sm">Send invite emails with their assessment links.</p>
            {inviteResult && <p className="text-blue-600 text-sm font-medium mt-1">{inviteResult}</p>}
          </div>
          <button
            onClick={handleSendInvites}
            disabled={isSendingInvites}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isSendingInvites ? 'Sending...' : 'Send Invites'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total Students</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Not Started</div>
          <div className="text-2xl font-bold text-gray-900">{stats.notStarted}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">In Progress</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Completed</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or ID..."
                className="w-full px-4 py-2 pl-10 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="not-started">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Completed / Submitted</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEvaluateAll}
              disabled={isEvaluating || stats.completed === 0}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEvaluating ? 'Evaluating...' : `Evaluate All (${stats.completed})`}
            </button>
            <button
              onClick={() => { loadProgressData(); setLastUpdated(new Date()); setSecondsSinceUpdate(0); }}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Updated {secondsSinceUpdate}s ago
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Started At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProgress.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {searchQuery || statusFilter !== 'all' 
                      ? 'No students match your filters' 
                      : 'No student data available'}
                  </td>
                </tr>
              ) : (
                filteredProgress.map((p) => (
                  <tr key={p.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-700">
                          {p.student.name}
                        </div>
                        <div className="text-xs text-gray-500">{p.student.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(p.status)}`}
                      >
                        {getStatusText(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1 space-y-2">
                          {/* Submission progress */}
                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>{p.questionsAnswered} / {p.totalQuestions} answered</span>
                              <span>{getProgressPercentage(p)}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${getProgressPercentage(p)}%` }}
                              />
                            </div>
                          </div>
                          {/* Per-question evaluation progress (shown when evaluating) */}
                          {evalProgress[p.studentId] && evalProgress[p.studentId].status !== 'not_started' && (
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={evalProgress[p.studentId].status === 'completed' ? 'text-green-400' : evalProgress[p.studentId].status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                                  {evalProgress[p.studentId].status === 'completed'
                                    ? 'Evaluated'
                                    : evalProgress[p.studentId].status === 'failed'
                                    ? 'Eval failed'
                                    : `Evaluating… ${evalProgress[p.studentId].questionsEvaluated}/${evalProgress[p.studentId].totalQuestions} questions`}
                                </span>
                                <span className="text-gray-500">{evalProgress[p.studentId].percentage}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-500 ${evalProgress[p.studentId].status === 'completed' ? 'bg-green-500' : evalProgress[p.studentId].status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`}
                                  style={{ width: `${evalProgress[p.studentId].percentage}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.startedAt ? new Date(p.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isInactive(p) && (
                          <span className="px-2 py-0.5 text-xs bg-orange-900/40 text-orange-400 border border-orange-700 rounded">
                            Inactive 30m+
                          </span>
                        )}
                        {(p.status === 'not-started' || p.status === 'in-progress') && (
                          reminderSent === p.studentId ? (
                            <span className="text-green-400 text-xs font-medium">Sent ✓</span>
                          ) : (
                            <button
                              onClick={() => handleSendReminder(p.studentId)}
                              disabled={sendingReminder === p.studentId}
                              className="text-yellow-400 hover:text-yellow-300 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {sendingReminder === p.studentId ? 'Sending…' : 'Send Reminder'}
                            </button>
                          )
                        )}
                        {(p.status === 'completed' || p.status === 'submitted') &&
                          (!evalProgress[p.studentId] || evalProgress[p.studentId].status === 'not_started') && (
                          <button
                            onClick={() => handleEvaluateSingle(p.studentId)}
                            disabled={evaluatingSingle[p.studentId]}
                            className="text-primary-400 hover:text-primary-300 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {evaluatingSingle[p.studentId] ? 'Starting…' : 'Evaluate'}
                          </button>
                        )}
                        {(p.status === 'not-started' || p.status === 'in-progress') && (
                          <Link
                            to={`/assessments/${assessmentId}/questions/${p.studentId}`}
                            className="text-gray-500 hover:text-gray-600 text-xs font-medium transition-colors"
                          >
                            Edit Questions
                          </Link>
                        )}
                        <button
                          onClick={() => handleCopyLink(p.studentId)}
                          title={`${STUDENT_APP_URL}/${p.studentId}/${assessmentId}`}
                          className="text-gray-500 hover:text-blue-300 text-xs font-medium transition-colors"
                        >
                          {copiedStudentId === p.studentId ? (
                            <span className="text-green-400">Copied ✓</span>
                          ) : (
                            'Copy Link'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
