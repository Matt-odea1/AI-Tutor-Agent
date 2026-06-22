/**
 * ProgressTracker - Visual progress indicator for assessment
 */

import { calculatePercentage } from '../utils/helpers';

interface ProgressTrackerProps {
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  questionIds?: string[];
  answeredQuestionIds?: Set<string>;
  // Questions resolved by a skip (time expired, nothing submitted). Rendered
  // with a distinct neutral marker — NOT the green check used for real answers.
  // Optional: when omitted, the tracker behaves exactly as before.
  skippedQuestionIds?: Set<string>;
  // When provided (review mode), each indicator becomes a button that navigates to
  // that question. When omitted the tracker is display-only, exactly as before.
  onNavigate?: (index: number) => void;
}

export default function ProgressTracker({
  currentIndex,
  totalQuestions,
  answeredCount,
  questionIds,
  answeredQuestionIds,
  skippedQuestionIds,
  onNavigate,
}: ProgressTrackerProps) {
  const percentage = calculatePercentage(answeredCount, totalQuestions);

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      {/* Progress Bar */}
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <span>Progress</span>
        <span className="font-medium">
          {answeredCount} / {totalQuestions} answered
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-primary-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Question Indicators */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: totalQuestions }, (_, i) => {
          const qId = questionIds?.[i] ?? '';
          const isCurrent = i === currentIndex;
          // Skipped takes visual precedence over answered (but not over current):
          // a time-expired skip must never wear the green "answered" check, even
          // if the server's authoritative answered list happens to include the id.
          const isSkipped = !!skippedQuestionIds && skippedQuestionIds.has(qId);
          const isAnswered = answeredQuestionIds && questionIds
            ? answeredQuestionIds.has(qId)
            : i < answeredCount;

          const state = isCurrent
            ? 'current'
            : isSkipped
            ? 'skipped'
            : isAnswered
            ? 'answered'
            : 'unanswered';

          const indicatorClass = `
                w-8 h-8 rounded-lg font-medium text-xs flex items-center justify-center
                ${isCurrent
                  ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                  : isSkipped
                  ? 'bg-amber-100 text-amber-800'
                  : isAnswered
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-400'
                }
                ${onNavigate ? 'cursor-pointer hover:ring-2 hover:ring-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500' : ''}
              `;

          const indicatorContent = !isCurrent && isSkipped ? (
            /* Skipped — neutral dash, deliberately NOT the answered check */
            <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
              <path strokeLinecap="round" strokeWidth={2} d="M5 10h10" />
            </svg>
          ) : !isCurrent && isAnswered ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            i + 1
          );

          // Navigable (review mode) → button; otherwise display-only div (unchanged).
          return onNavigate ? (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(i)}
              className={indicatorClass}
              aria-label={`Go to question ${i + 1}, ${state}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {indicatorContent}
            </button>
          ) : (
            <div
              key={i}
              className={indicatorClass}
              aria-label={`Question ${i + 1}, ${state}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {indicatorContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
