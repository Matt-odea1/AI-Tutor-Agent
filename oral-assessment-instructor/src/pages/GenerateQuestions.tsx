import { Link, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import QuestionGenerationProgress from '../components/QuestionGenerationProgress';
import SetupStepIndicator from '../components/SetupStepIndicator';

export default function GenerateQuestions() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { selectedAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();

  useEffect(() => {
    if (assessmentId && assessmentId !== selectedAssessment?.id) {
      loadAssessment(assessmentId);
    }
  }, [assessmentId]);

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

  if (!selectedAssessment || !assessmentId) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/assessments" className="text-slate-400 hover:text-slate-300">
              ← Back to Assessments
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-2">
            Generate Questions: {selectedAssessment.title}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{selectedAssessment.course}</p>
        </div>
      </header>

      <SetupStepIndicator currentStep={3} assessmentId={assessmentId!} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <QuestionGenerationProgress assessmentId={assessmentId} />
      </main>
    </div>
  );
}
