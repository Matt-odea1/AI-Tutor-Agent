import type { Assessment } from '../types';

interface PreAssessmentOverviewProps {
  assessment: Assessment;
  questionCount: number;
  onStart: () => void;
  /** Label for the action button. Defaults to "Start Assessment"; the oral flow now
   *  passes "Continue" because this step leads to the mic device check, not the exam. */
  startLabel?: string;
}

export default function PreAssessmentOverview({
  assessment,
  questionCount,
  onStart,
  startLabel = 'Start Assessment',
}: PreAssessmentOverviewProps) {
  const timeLimitMinutes = assessment.timeLimit ? Math.round(assessment.timeLimit / 60) : null;

  return (
    <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-4 z-40">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{assessment.title}</h2>
        <p className="text-sm text-gray-500 mb-6">{assessment.course}</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-primary-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-primary-700">{questionCount}</div>
            <div className="text-sm text-primary-600 mt-1">Questions</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            {timeLimitMinutes ? (
              <>
                <div className="text-3xl font-bold text-purple-700">{timeLimitMinutes}</div>
                <div className="text-sm text-purple-600 mt-1">min per question</div>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-purple-700">—</div>
                <div className="text-sm text-purple-600 mt-1">No time limit</div>
              </>
            )}
          </div>
        </div>

        {assessment.description && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Instructions</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{assessment.description}</p>
          </div>
        )}

        <ul className="text-sm text-gray-600 space-y-1 mb-8">
          <li>• Answer each question using {assessment.answerMode === 'written' ? 'text' : 'audio'}</li>
          <li>• Questions are presented one at a time in order</li>
          <li>• Submit each answer before moving to the next question</li>
        </ul>

        <button
          onClick={onStart}
          className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors text-lg"
        >
          {startLabel}
        </button>
      </div>
    </div>
  );
}
