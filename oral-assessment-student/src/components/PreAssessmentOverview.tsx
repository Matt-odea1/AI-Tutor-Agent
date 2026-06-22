import type { Assessment } from '../types';
import { estimateTotalMinutes } from '../utils/timeEstimate';

interface PreAssessmentOverviewProps {
  assessment: Assessment;
  questionCount: number;
  onStart: () => void;
  /** Label for the action button. Defaults to "Start Assessment"; the oral flow now
   *  passes "Continue" because this step leads to the mic device check, not the exam. */
  startLabel?: string;
  /**
   * Optional real per-question limits (seconds). When supplied, the total-time
   * estimate sums them (most accurate); otherwise it falls back to
   * questionCount × the assessment's representative per-question limit.
   */
  perQuestionSeconds?: Array<number | null | undefined>;
}

export default function PreAssessmentOverview({
  assessment,
  questionCount,
  onStart,
  startLabel = 'Start Assessment',
  perQuestionSeconds,
}: PreAssessmentOverviewProps) {
  const timeLimitMinutes = assessment.timeLimit ? Math.round(assessment.timeLimit / 60) : null;
  // Whole-assessment estimate, clearly labelled as an estimate. Null when no
  // per-question limit exists anywhere (then we show "No time limit" and omit it).
  const estimatedTotalMinutes = estimateTotalMinutes({
    questionCount,
    perQuestionSeconds,
    fallbackPerQuestionSeconds: assessment.timeLimit ?? null,
  });

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

        {/* Whole-assessment time estimate, clearly labelled an estimate. Hidden
            when there is no per-question limit (the purple tile already shows
            "No time limit" in that case). */}
        {estimatedTotalMinutes !== null && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-6 -mt-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Estimated total: <span className="font-semibold text-gray-800">~{estimatedTotalMinutes} min</span>
            </span>
          </div>
        )}

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
