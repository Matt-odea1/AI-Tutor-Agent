import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import ResultsDashboard from '../components/ResultsDashboard';

export default function ViewResults() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { selectedAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();

  const loadAssessment = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const assessment = await apiService.getAssessment(id);
      setSelectedAssessment(assessment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assessmentId && assessmentId !== selectedAssessment?.id) {
      loadAssessment(assessmentId);
    }
  }, [assessmentId]);

  if (!selectedAssessment || !assessmentId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-4 mb-2">
                <Link to="/assessments" className="text-gray-500 hover:text-gray-600">
                  ← Back to Assessments
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Results: {selectedAssessment.title}
              </h1>
              <p className="text-gray-500 text-sm mt-1">{selectedAssessment.course}</p>
            </div>
            <Link
              to={`/assessments/${assessmentId}/monitor`}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Back to Progress
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ResultsDashboard assessmentId={assessmentId} />
      </main>
    </div>
  );
}
