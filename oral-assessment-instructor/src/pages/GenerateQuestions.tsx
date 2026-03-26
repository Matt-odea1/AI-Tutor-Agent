import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';
import { apiService } from '../services/api';
import QuestionGenerationProgress from '../components/QuestionGenerationProgress';
import SetupStepIndicator from '../components/SetupStepIndicator';

export default function GenerateQuestions() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { selectedAssessment, setSelectedAssessment, setLoading, setError } = useAssessmentStore();
  const [brief, setBrief] = useState('');
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [briefSaved, setBriefSaved] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  useEffect(() => {
    if (assessmentId && assessmentId !== selectedAssessment?.id) {
      loadAssessment(assessmentId);
    } else if (selectedAssessment?.assignmentBrief) {
      setBrief(selectedAssessment.assignmentBrief);
    }
  }, [assessmentId, selectedAssessment?.id]);

  const loadAssessment = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const assessment = await apiService.getAssessment(id);
      setSelectedAssessment(assessment);
      if (assessment.assignmentBrief) setBrief(assessment.assignmentBrief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBrief = async () => {
    if (!assessmentId) return;
    if (brief.trim().length < 50) {
      setBriefError('Brief must be at least 50 characters.');
      return;
    }
    setIsSavingBrief(true);
    setBriefError(null);
    try {
      await apiService.updateBrief(assessmentId, brief.trim());
      setBriefSaved(true);
      setTimeout(() => setBriefSaved(false), 3000);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Failed to save brief');
    } finally {
      setIsSavingBrief(false);
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Assignment Brief Editor */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Assignment Brief</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Describe the assignment so the AI can generate relevant questions. Minimum 50 characters.
              </p>
            </div>
            {!brief.trim() && (
              <span className="px-2.5 py-1 text-xs font-medium bg-yellow-900/40 text-yellow-300 border border-yellow-700 rounded">
                No brief set
              </span>
            )}
          </div>
          <textarea
            value={brief}
            onChange={(e) => { setBrief(e.target.value); setBriefError(null); }}
            rows={5}
            placeholder="Describe the assignment, its objectives, the programming concepts it covers, and what students were expected to implement..."
            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y text-sm"
          />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs ${brief.trim().length < 50 ? 'text-slate-500' : 'text-green-400'}`}>
              {brief.trim().length} / 50 characters minimum
            </span>
            <div className="flex items-center gap-3">
              {briefSaved && <span className="text-xs text-green-400">Saved ✓</span>}
              {briefError && <span className="text-xs text-red-400">{briefError}</span>}
              <button
                onClick={handleSaveBrief}
                disabled={isSavingBrief || brief.trim().length < 50}
                className="bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingBrief ? 'Saving…' : 'Save Brief'}
              </button>
            </div>
          </div>
        </div>

        <QuestionGenerationProgress assessmentId={assessmentId} />
      </main>
    </div>
  );
}
