import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { AssessmentResults } from '../../../shared/types/assessment';

interface ResultsDashboardProps {
  assessmentId: string;
  evalJobId?: string; // if set, opens SSE stream and auto-refreshes when done
}

export default function ResultsDashboard({ assessmentId, evalJobId }: ResultsDashboardProps) {
  const navigate = useNavigate();
  const { results, setResults, setLoading, setError } = useAssessmentStore();

  const [filteredResults, setFilteredResults] = useState<AssessmentResults[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'date'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadResults();
  }, [assessmentId]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [results, gradeFilter, sortBy, sortOrder]);

  // SSE: auto-refresh results when evaluation job completes
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
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [evalJobId]);

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

  const applyFiltersAndSort = () => {
    const resultsArray = Array.isArray(results) ? results : [];
    let filtered = [...resultsArray];

    if (gradeFilter !== 'all') {
      filtered = filtered.filter(r => r.grade === gradeFilter);
    }

    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'score') {
        comparison = a.percentage - b.percentage;
      } else if (sortBy === 'date') {
        comparison = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      } else {
        // name sort — names are present in StudentResultItem
        const aName = a.name ?? a.studentId;
        const bName = b.name ?? b.studentId;
        comparison = aName.localeCompare(bName);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredResults(filtered);
  };

  const handleReleaseResults = async () => {
    try {
      setIsReleasing(true);
      setReleaseMessage(null);
      await apiService.releaseResults(assessmentId);
      setReleaseMessage('Results released to students.');
    } catch (err) {
      setReleaseMessage(err instanceof Error ? err.message : 'Failed to release results');
    } finally {
      setIsReleasing(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Student ID', 'Name', 'Email', 'Total Score', 'Max Score', 'Percentage', 'Grade', 'Completed At'];
    const rows = filteredResults.map(r => [
      r.studentId,
      r.name ?? '',
      r.email ?? '',
      r.totalScore,
      r.maxScore,
      r.percentage,
      r.grade,
      new Date(r.completedAt).toLocaleString(),
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assessment-${assessmentId}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };


  const resultsArray = Array.isArray(results) ? results : [];

  const stats = {
    totalStudents: resultsArray.length,
    averageScore: resultsArray.length > 0
      ? Math.round(resultsArray.reduce((sum, r) => sum + r.percentage, 0) / resultsArray.length)
      : 0,
    medianScore: (() => {
      if (resultsArray.length === 0) return 0;
      const sorted = [...resultsArray].map(r => r.percentage).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? Math.round(sorted[mid]) : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    })(),
    excellentCount: resultsArray.filter(r => r.grade === 'Excellent').length,
    competentCount: resultsArray.filter(r => r.grade === 'Competent').length,
    developingCount: resultsArray.filter(r => r.grade === 'Developing').length,
    unsatisfactoryCount: resultsArray.filter(r => r.grade === 'Unsatisfactory').length,
  };

  const gradeDistributionData = [
    { name: 'Excellent', value: stats.excellentCount, color: '#10b981' },
    { name: 'Competent', value: stats.competentCount, color: '#3b82f6' },
    { name: 'Developing', value: stats.developingCount, color: '#f59e0b' },
    { name: 'Unsatisfactory', value: stats.unsatisfactoryCount, color: '#ef4444' },
  ].filter(item => item.value > 0);

  const scoreRanges = [
    { range: '0-20%', min: 0, max: 20 },
    { range: '21-40%', min: 21, max: 40 },
    { range: '41-60%', min: 41, max: 60 },
    { range: '61-80%', min: 61, max: 80 },
    { range: '81-100%', min: 81, max: 100 },
  ];

  const scoreDistributionData = scoreRanges.map(range => ({
    range: range.range,
    count: resultsArray.filter(r => r.percentage >= range.min && r.percentage <= range.max).length,
  }));

  const getGradeBadgeColor = (grade: string) => {
    const colors: Record<string, string> = {
      Excellent: 'bg-green-600 text-white',
      Competent: 'bg-blue-600 text-white',
      Developing: 'bg-yellow-600 text-white',
      Unsatisfactory: 'bg-red-600 text-white',
    };
    return colors[grade] || 'bg-slate-600 text-slate-200';
  };

  if (results.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
        <svg className="mx-auto h-16 w-16 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">No Results Available</h3>
        <p className="text-slate-400">Results will appear here once students complete the assessment and evaluations are processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Release Results Banner */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        {showReleaseConfirm ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-yellow-300">Confirm release?</p>
            <p className="text-xs text-slate-400">This will make scores and feedback visible to all students immediately and cannot be undone.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowReleaseConfirm(false); handleReleaseResults(); }}
                disabled={isReleasing}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              >
                {isReleasing ? 'Releasing…' : 'Confirm Release'}
              </button>
              <button
                onClick={() => setShowReleaseConfirm(false)}
                className="bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-200">Release Results to Students</p>
              <p className="text-xs text-slate-400">Students will be able to view their scores and feedback after release.</p>
              {releaseMessage && (
                <p className="text-xs text-green-400 mt-1">{releaseMessage}</p>
              )}
            </div>
            <button
              onClick={() => setShowReleaseConfirm(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Release Results
            </button>
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Average Score</div>
          <div className="text-4xl font-bold text-slate-100">{stats.averageScore}%</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Median Score</div>
          <div className="text-4xl font-bold text-slate-100">{stats.medianScore}%</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Total Students</div>
          <div className="text-4xl font-bold text-slate-100">{stats.totalStudents}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Excellent Rate</div>
          <div className="text-4xl font-bold text-green-400">
            {stats.totalStudents > 0 ? Math.round((stats.excellentCount / stats.totalStudents) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Grade Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={gradeDistributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                dataKey="value"
              >
                {gradeDistributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={scoreDistributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="range" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} labelStyle={{ color: '#e2e8f0' }} />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="count" fill="#6366f1" name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters and Export */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="all">All Grades</option>
              <option value="Excellent">Excellent</option>
              <option value="Competent">Competent</option>
              <option value="Developing">Developing</option>
              <option value="Unsatisfactory">Unsatisfactory</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'score' | 'date')}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="score">Sort by Score</option>
              <option value="name">Sort by Name</option>
              <option value="date">Sort by Date</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 hover:bg-slate-600 transition-colors"
            >
              {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Export CSV
            </button>
            <button
              disabled
              title="Audio export — coming soon"
              className="bg-slate-600 text-slate-400 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              Export Audio ZIP
            </button>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-750">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Student</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Percentage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Completed At</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredResults.map((result) => (
                <tr key={result.studentId} className="hover:bg-slate-750">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-200">{result.name ?? result.studentId}</div>
                    <div className="text-xs text-slate-400">{result.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">{result.totalScore} / {result.maxScore}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 max-w-[100px]">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className="bg-primary-600 h-2 rounded-full transition-all duration-300" style={{ width: `${result.percentage}%` }} />
                        </div>
                      </div>
                      <span className="text-sm text-slate-200">{result.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getGradeBadgeColor(result.grade)}`}>{result.grade}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300" title={new Date(result.completedAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(result.completedAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/assessments/${assessmentId}/student/${result.studentId}/results`)}
                      className="text-primary-400 hover:text-primary-300 text-sm font-medium transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
