import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import BulkUploadCSV from '../components/BulkUploadCSV';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';

export default function UploadStudents() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();
  const { toast, showToast, dismissToast } = useToast();

  const [edToken, setEdToken] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; students: { studentId: string; name: string; hasCode: boolean }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

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

  useEffect(() => {
    const state = location.state as { created?: string } | null;
    if (state?.created) {
      showToast(`Assessment "${state.created}" created successfully.`);
    }
  }, []);

  const handleEdImport = async () => {
    if (!assessmentId || !edToken.trim() || !challengeId.trim()) return;
    setIsImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await apiService.importFromEd(assessmentId, edToken.trim(), Number(challengeId.trim()));
      setImportResult({ count: result.studentsImported, students: result.students });
      showToast(`Imported ${result.studentsImported} students from Ed.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import from Ed';
      setImportError(msg);
    } finally {
      setIsImporting(false);
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
          <Link to="/assessments" className="text-gray-500 hover:text-gray-600 text-sm">
            ← Back to Assessments
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            Upload Students: {selectedAssessment.title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{selectedAssessment.course}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Import from Ed */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Import from Ed</h2>
          <p className="text-sm text-gray-500 mb-4">
            Pull students and their code submissions directly from an Ed challenge.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="challengeId" className="block text-sm font-medium text-gray-700 mb-1">
                Challenge ID
              </label>
              <input
                id="challengeId"
                type="number"
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                placeholder="e.g. 238511"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">From the Ed URL: edstem.org/.../challenges/<strong>ID</strong></p>
            </div>
            <div>
              <label htmlFor="edToken" className="block text-sm font-medium text-gray-700 mb-1">
                Ed API Token
              </label>
              <input
                id="edToken"
                type="password"
                value={edToken}
                onChange={(e) => setEdToken(e.target.value)}
                placeholder="Your Ed API token"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-400">From edstem.org → Settings → API Tokens</p>
            </div>
          </div>

          {importError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{importError}</p>
            </div>
          )}

          {importResult && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-medium mb-1">
                Imported {importResult.count} students
              </p>
              <ul className="text-xs text-green-600 space-y-0.5">
                {importResult.students.slice(0, 5).map((s) => (
                  <li key={s.studentId}>{s.name} ({s.studentId}) {s.hasCode ? '— code loaded' : '— no submission'}</li>
                ))}
                {importResult.students.length > 5 && (
                  <li>...and {importResult.students.length - 5} more</li>
                )}
              </ul>
              <button
                onClick={() => navigate(`/assessments/${assessmentId}/generate`)}
                className="mt-3 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Continue to Generate Questions
              </button>
            </div>
          )}

          <button
            onClick={handleEdImport}
            disabled={isImporting || !edToken.trim() || !challengeId.trim()}
            className="bg-primary-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? 'Importing...' : 'Import from Ed'}
          </button>
        </div>

        {/* CSV fallback */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Or upload CSV</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload a CSV file with student information and code submissions manually.
          </p>
          <BulkUploadCSV
            assessmentId={selectedAssessment.id}
            onUploadSuccess={() => showToast('Students uploaded successfully.')}
          />
        </div>
      </main>
    </div>
  );
}
