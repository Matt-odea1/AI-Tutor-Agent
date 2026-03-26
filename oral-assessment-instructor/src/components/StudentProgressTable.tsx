import { useState, useEffect, useRef } from 'react';
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
  const [evalProgress, setEvalProgress] = useState<Record<string, EvalProgress>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [showRefreshInfo, setShowRefreshInfo] = useState(true);
  const evalStreams = useRef<Record<string, EventSource>>({});
  const INACTIVE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  // Load initial data
  useEffect(() => {
    loadProgressData();
    loadStudents();
  }, [assessmentId]);

  // Start polling for progress updates
  useEffect(() => {
    startPolling();
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
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
    if (pollingInterval) return;

    const interval = setInterval(async () => {
      try {
        const progressData = await apiService.getAssessmentProgress(assessmentId);
        setProgress(Array.isArray(progressData) ? progressData : []);
        setLastUpdated(new Date());
        setSecondsSinceUpdate(0);
      } catch (err) {
        console.error('Error polling progress:', err);
      }
    }, 10000); // Poll every 10 seconds

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
    if (statusFilter !== 'all') {
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
        if (data.status === 'completed' || data.status === 'failed') {
          es.close();
          delete evalStreams.current[studentId];
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      es.close();
      delete evalStreams.current[studentId];
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

  const handleSendReminder = async (studentId: string) => {
    setSendingReminder(studentId);
    try {
      await apiService.sendReminder(assessmentId, studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setSendingReminder(null);
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
      'not-started': 'bg-slate-600 text-slate-200',
      'in-progress': 'bg-yellow-600 text-white',
      'completed': 'bg-green-600 text-white',
      'submitted': 'bg-blue-600 text-white',
    };
    return badges[status as keyof typeof badges] || 'bg-slate-600 text-slate-200';
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

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Total Students</div>
          <div className="text-2xl font-bold text-slate-100">{stats.total}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Not Started</div>
          <div className="text-2xl font-bold text-slate-100">{stats.notStarted}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">In Progress</div>
          <div className="text-2xl font-bold text-yellow-400">{stats.inProgress}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Completed</div>
          <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, or ID..."
                className="w-full px-4 py-2 pl-10 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400"
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
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="not-started">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="submitted">Submitted</option>
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
              className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              Refresh
            </button>
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                Updated {secondsSinceUpdate}s ago
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-750">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Started At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredProgress.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {searchQuery || statusFilter !== 'all' 
                      ? 'No students match your filters' 
                      : 'No student data available'}
                  </td>
                </tr>
              ) : (
                filteredProgress.map((p) => (
                  <tr key={p.studentId} className="hover:bg-slate-750">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-200">
                          {p.student.name}
                        </div>
                        <div className="text-xs text-slate-400">{p.student.email}</div>
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
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                              <span>{p.questionsAnswered} / {p.totalQuestions} answered</span>
                              <span>{getProgressPercentage(p)}%</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-2">
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
                                <span className="text-slate-400">{evalProgress[p.studentId].percentage}%</span>
                              </div>
                              <div className="w-full bg-slate-700 rounded-full h-1.5">
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
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {p.startedAt ? new Date(p.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isInactive(p) && (
                          <span className="px-2 py-0.5 text-xs bg-orange-900/40 text-orange-400 border border-orange-700 rounded">
                            Inactive 30m+
                          </span>
                        )}
                        {(p.status === 'not-started' || p.status === 'in-progress') && (
                          <button
                            onClick={() => handleSendReminder(p.studentId)}
                            disabled={sendingReminder === p.studentId}
                            className="text-yellow-400 hover:text-yellow-300 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {sendingReminder === p.studentId ? 'Sending…' : 'Send Reminder'}
                          </button>
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      {showRefreshInfo && (
        <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <svg
                className="h-5 w-5 text-blue-400 mr-3 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-blue-300 mb-1">Auto-refresh Enabled</h4>
                <p className="text-sm text-blue-200">
                  This table automatically refreshes every 10 seconds to show real-time progress updates.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRefreshInfo(false)}
              className="text-blue-400 hover:text-blue-200 ml-4 text-lg leading-none flex-shrink-0"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
