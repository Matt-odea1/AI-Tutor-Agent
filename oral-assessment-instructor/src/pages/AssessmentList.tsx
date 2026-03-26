import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import { format } from 'date-fns';

export default function AssessmentList() {
  const navigate = useNavigate();
  const { assessments, setAssessments, isLoading, setLoading, error, setError } = useAssessmentStore();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statsCache, setStatsCache] = useState<Record<string, { enrolled: number; completed: number }>>({});

  useEffect(() => {
    loadAssessments();
  }, []);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.listAssessments();
      const list = Array.isArray(data) ? data : [];
      setAssessments(list);
      // Fetch enrollment/completion stats for all assessments in parallel
      const entries = await Promise.all(
        list.map(async (a) => {
          try {
            const [studentsData, progData] = await Promise.all([
              apiService.getAssessmentStudents(a.id),
              apiService.getAssessmentProgress(a.id),
            ]);
            const enrolled = Array.isArray(studentsData) ? studentsData.length : 0;
            const prog = Array.isArray(progData) ? progData : [];
            const completed = prog.filter(s => s.status === 'submitted' || s.status === 'completed').length;
            return [a.id, { enrolled, completed }] as const;
          } catch {
            return [a.id, { enrolled: 0, completed: 0 }] as const;
          }
        })
      );
      setStatsCache(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    navigate('/login');
  };

  const handleDelete = async (assessmentId: string) => {
    setIsDeleting(true);
    try {
      await apiService.deleteAssessment(assessmentId);
      const current = Array.isArray(assessments) ? assessments : [];
      setAssessments(current.filter(a => a.id !== assessmentId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment');
    } finally {
      setIsDeleting(false);
    }
  };

  // Display assessments (real data when available)
  const displayAssessments = Array.isArray(assessments) ? assessments : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'draft': return 'bg-gray-600';
      case 'completed': return 'bg-blue-600';
      case 'archived': return 'bg-slate-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-100">
              Oral Assessments
            </h1>
            <div className="flex items-center space-x-3">
              <Link
                to="/assessments/create"
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                + Create Assessment
              </Link>
              <button
                onClick={handleLogout}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500 rounded-lg p-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="grid gap-6">
            {displayAssessments.map((assessment) => (
            <div
              key={assessment.id}
              className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-6 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h2 className="text-xl font-semibold text-slate-100">
                      {assessment.title}
                    </h2>
                    <span className={`${getStatusColor(assessment.status)} text-white text-xs px-2 py-1 rounded-full`}>
                      {assessment.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-slate-400 mb-2">
                    <span>📚 {assessment.course}</span>
                    <span>📅 Due: {format(new Date(assessment.dueDate), 'MMM dd, yyyy')}</span>
                    <span>🔢 {assessment.totalQuestions} questions</span>
                  </div>
                  {statsCache[assessment.id] && (
                    <div className="flex items-center space-x-4 text-xs text-slate-500 mb-2">
                      <span>👥 {statsCache[assessment.id].enrolled} enrolled</span>
                      <span>✅ {statsCache[assessment.id].completed} completed</span>
                    </div>
                  )}
                </div>
              </div>

              {confirmDeleteId === assessment.id ? (
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-sm text-red-300">Delete this assessment?</span>
                  <button
                    onClick={() => handleDelete(assessment.id)}
                    disabled={isDeleting}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="bg-slate-700 text-slate-200 px-3 py-1 rounded text-sm font-medium hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3 mt-4">
                  <Link
                    to={`/assessments/${assessment.id}/monitor`}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Monitor Progress
                  </Link>
                  <Link
                    to={`/assessments/${assessment.id}/results`}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    View Results
                  </Link>
                  <button
                    onClick={() => navigate(`/assessments/${assessment.id}/generate`)}
                    className="text-slate-400 hover:text-slate-300 px-4 py-2 text-sm font-medium transition-colors"
                  >
                    Questions
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(assessment.id)}
                    className="text-red-400 hover:text-red-300 px-4 py-2 text-sm font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            ))}
          </div>
        )}

        {!isLoading && !error && displayAssessments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4">No assessments yet</p>
            <Link
              to="/assessments/create"
              className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Your First Assessment
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
