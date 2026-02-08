import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import JSZip from 'jszip';
import { apiService } from '../services/api';
import { useAssessmentStore } from '../store/assessmentStore';
import type { AssessmentResults } from '../../../shared/types/assessment';

interface ResultsDashboardProps {
  assessmentId: string;
}

export default function ResultsDashboard({ assessmentId }: ResultsDashboardProps) {
  const { results, setResults, setLoading, setError } = useAssessmentStore();
  
  const [filteredResults, setFilteredResults] = useState<AssessmentResults[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'date'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadResults();
  }, [assessmentId]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [results, gradeFilter, sortBy, sortOrder]);

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

    // Apply grade filter
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(r => r.grade === gradeFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'score') {
        comparison = a.percentage - b.percentage;
      } else if (sortBy === 'date') {
        comparison = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      } else {
        // Sort by name - need to fetch student info
        comparison = 0; // Would need student names
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredResults(filtered);
  };

  const exportToCSV = () => {
    const headers = ['Student ID', 'Total Score', 'Max Score', 'Percentage', 'Grade', 'Completed At'];
    const rows = filteredResults.map(r => [
      r.studentId,
      r.totalScore,
      r.maxScore,
      r.percentage,
      r.grade,
      new Date(r.completedAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assessment-${assessmentId}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAudioZip = async () => {
    try {
      setIsExporting(true);
      const zip = new JSZip();

      // In a real implementation, you would:
      // 1. Fetch audio URLs for each student
      // 2. Download each audio file
      // 3. Add to zip
      // For now, we'll create a placeholder

      zip.file('README.txt', 'Audio files export - Implementation pending');

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assessment-${assessmentId}-audio.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export audio files');
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate statistics
  const resultsArray = Array.isArray(results) ? results : [];
  const stats = {
    totalStudents: resultsArray.length,
    averageScore: resultsArray.length > 0 
      ? Math.round(resultsArray.reduce((sum, r) => sum + r.percentage, 0) / resultsArray.length)
      : 0,
    completionRate: 100, // All results are complete
    excellentCount: resultsArray.filter(r => r.grade === 'Excellent').length,
    competentCount: resultsArray.filter(r => r.grade === 'Competent').length,
    developingCount: resultsArray.filter(r => r.grade === 'Developing').length,
    unsatisfactoryCount: resultsArray.filter(r => r.grade === 'Unsatisfactory').length,
  };

  // Grade distribution data for pie chart
  const gradeDistributionData = [
    { name: 'Excellent', value: stats.excellentCount, color: '#10b981' },
    { name: 'Competent', value: stats.competentCount, color: '#3b82f6' },
    { name: 'Developing', value: stats.developingCount, color: '#f59e0b' },
    { name: 'Unsatisfactory', value: stats.unsatisfactoryCount, color: '#ef4444' },
  ].filter(item => item.value > 0);

  // Score distribution data for bar chart
  const scoreRanges = [
    { range: '0-20%', min: 0, max: 20 },
    { range: '21-40%', min: 21, max: 40 },
    { range: '41-60%', min: 41, max: 60 },
    { range: '61-80%', min: 61, max: 80 },
    { range: '81-100%', min: 81, max: 100 },
  ];

  const scoreDistributionData = scoreRanges.map(range => ({
    range: range.range,
    count: results.filter(r => r.percentage >= range.min && r.percentage <= range.max).length,
  }));

  const getGradeBadgeColor = (grade: string) => {
    const colors = {
      'Excellent': 'bg-green-600 text-white',
      'Competent': 'bg-blue-600 text-white',
      'Developing': 'bg-yellow-600 text-white',
      'Unsatisfactory': 'bg-red-600 text-white',
    };
    return colors[grade as keyof typeof colors] || 'bg-slate-600 text-slate-200';
  };

  if (results.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
        <svg
          className="mx-auto h-16 w-16 text-slate-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">No Results Available</h3>
        <p className="text-slate-400">
          Results will appear here once students complete the assessment and evaluations are processed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Average Score</div>
          <div className="text-4xl font-bold text-slate-100">{stats.averageScore}%</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Completion Rate</div>
          <div className="text-4xl font-bold text-green-400">{stats.completionRate}%</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="text-sm text-slate-400 mb-2">Total Students</div>
          <div className="text-4xl font-bold text-slate-100">{stats.totalStudents}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Grade Distribution Pie Chart */}
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
                fill="#8884d8"
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

        {/* Score Distribution Bar Chart */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={scoreDistributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="range" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
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
            {/* Grade Filter */}
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

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'score' | 'date')}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="score">Sort by Score</option>
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
            </select>

            {/* Sort Order */}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 hover:bg-slate-600 transition-colors"
            >
              {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </button>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Export CSV
            </button>
            <button
              onClick={exportAudioZip}
              disabled={isExporting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export Audio ZIP'}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Student ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Percentage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Completed At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredResults.map((result) => (
                <tr key={result.studentId} className="hover:bg-slate-750">
                  <td className="px-4 py-3 text-sm text-slate-200">{result.studentId}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {result.totalScore} / {result.maxScore}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 max-w-[100px]">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${result.percentage}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm text-slate-200">{result.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getGradeBadgeColor(result.grade)}`}>
                      {result.grade}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {new Date(result.completedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-primary-400 hover:text-primary-300 text-sm font-medium transition-colors">
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
