import { Link, useParams, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import BulkUploadCSV from '../components/BulkUploadCSV';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';

export default function UploadStudents() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const location = useLocation();
  const { selectedAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (assessmentId && assessmentId !== selectedAssessment?.id) {
      loadAssessment(assessmentId);
    }
  }, [assessmentId]);

  // Show success banner if we just created an assessment
  useEffect(() => {
    const state = location.state as { created?: string } | null;
    if (state?.created) {
      showToast(`Assessment "${state.created}" created successfully.`);
    }
  }, []);

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

  if (!selectedAssessment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/assessments" className="text-gray-500 hover:text-gray-600">
              ← Back to Assessments
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            Upload Students: {selectedAssessment.title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{selectedAssessment.course}</p>
        </div>
      </header>


      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Step 2: Upload Student Data
            </h2>
            <p className="text-gray-500 text-sm">
              Upload a CSV file with student information and their code submissions.
              After uploading, you can proceed to generate questions automatically.
            </p>
          </div>

          <BulkUploadCSV
            assessmentId={selectedAssessment.id}
            onUploadSuccess={() => showToast('Students uploaded successfully.')}
          />
        </div>
      </main>
    </div>
  );
}
