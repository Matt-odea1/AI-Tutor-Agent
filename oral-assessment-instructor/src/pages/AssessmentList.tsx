import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';

export default function AssessmentList() {
  const navigate = useNavigate();
  const { assessments, setAssessments, isLoading, setLoading, error, setError } = useAssessmentStore();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statsCache, setStatsCache] = useState<Record<string, { enrolled: number; completed: number }>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [users, setUsers] = useState<{ email: string; roles: string[]; createdAt: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);;

  const loadAssessments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.listAssessments();
      const list = Array.isArray(data) ? data : [];
      setAssessments(list);
      setLoading(false);

      // Load stats in background — don't block the page render.
      // Sequential to avoid overwhelming the single-worker backend.
      for (const a of list) {
        try {
          const progData = await apiService.getAssessmentProgress(a.id);
          const prog = Array.isArray(progData) ? progData : [];
          const enrolled = prog.length;
          const completed = prog.filter(s => s.status === 'submitted' || s.status === 'completed').length;
          setStatsCache(prev => ({ ...prev, [a.id]: { enrolled, completed } }));
        } catch {
          // skip — card just won't show stats
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessments');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Intentional: load assessments once on mount. loadAssessments toggles
    // loading/error/data state as it fetches — effect-driven initial fetch,
    // not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssessments();
  }, []);

  // Auto-refresh stats when page regains focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAssessments();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  const openSettings = async () => {
    setShowSettings(true);
    setUsersLoading(true);
    try {
      const data = await apiService.listUsers();
      setUsers(data);
    } catch {
      // ignore — table stays empty
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleInstructor = async (email: string, currentRoles: string[]) => {
    setRoleUpdating(email);
    const isInstructor = currentRoles.includes('instructor');
    const newRoles = isInstructor
      ? currentRoles.filter(r => r !== 'instructor')
      : [...currentRoles.filter(r => r !== 'instructor'), 'instructor'];
    try {
      await apiService.setUserRoles(email, newRoles);
      setUsers(prev => prev.map(u => u.email === email ? { ...u, roles: newRoles } : u));
    } catch {
      // ignore
    } finally {
      setRoleUpdating(null);
    }
  };

  // Display assessments (real data when available)
  const displayAssessments = Array.isArray(assessments) ? assessments : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-600';
      case 'draft': return 'bg-gray-600';
      case 'completed': return 'bg-blue-600';
      case 'archived': return 'bg-gray-200';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Oral Assessments
            </h1>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => loadAssessments()}
                disabled={isLoading}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                title="Refresh assessments"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <Link
                to="/assessments/create"
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                + Create Assessment
              </Link>
              <button
                onClick={openSettings}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                title="Settings"
              >
                ⚙ Settings
              </button>
              <button
                onClick={handleLogout}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
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
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <Link to={`/assessments/${assessment.id}/results`} className="text-lg font-semibold text-gray-900 hover:text-primary-600 truncate">
                      {assessment.title}
                    </Link>
                    <span className={`${getStatusColor(assessment.status)} text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0`}>
                      {assessment.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {assessment.course}
                    {statsCache[assessment.id] && (
                      <span className="ml-3">{statsCache[assessment.id].enrolled} students, {statsCache[assessment.id].completed} completed</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <Link
                    to={`/assessments/${assessment.id}/results`}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Open
                  </Link>
                  {confirmDeleteId === assessment.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(assessment.id)}
                        disabled={isDeleting}
                        className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(assessment.id)}
                      className="text-gray-400 hover:text-red-500 text-sm transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
            ))}
          </div>
        )}

        {!isLoading && !error && displayAssessments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No assessments yet</p>
            <Link
              to="/assessments/create"
              className="inline-block bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Your First Assessment
            </Link>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">User Management</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-4">Toggle instructor access for registered users.</p>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
              ) : users.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No registered users found.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {users.map(user => {
                    const isInstructor = user.roles.includes('instructor');
                    const isUpdating = roleUpdating === user.email;
                    return (
                      <div key={user.email} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{user.email}</p>
                          <p className="text-xs text-gray-500">
                            {user.roles.length > 0 ? user.roles.join(', ') : 'no roles'}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleInstructor(user.email, user.roles)}
                          disabled={isUpdating}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                            isInstructor
                              ? 'bg-primary-100 text-primary-700 hover:bg-red-100 hover:text-red-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-700'
                          }`}
                        >
                          {isUpdating ? '...' : isInstructor ? 'Instructor ✓' : 'Make Instructor'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
