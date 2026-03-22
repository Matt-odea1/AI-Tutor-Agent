/**
 * ProgressTracker - Visual progress indicator for assessment
 */

import { calculatePercentage } from '../utils/helpers';

interface ProgressTrackerProps {
  currentIndex: number;
  totalQuestions: number;
  answeredCount: number;
  onNavigate?: (index: number) => void;
}

export default function ProgressTracker({
  currentIndex,
  totalQuestions,
  answeredCount,
  onNavigate,
}: ProgressTrackerProps) {
  const percentage = calculatePercentage(answeredCount, totalQuestions);

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress</span>
          <span className="font-medium">
            {answeredCount} / {totalQuestions} answered ({percentage}%)
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Question Indicators */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: totalQuestions }, (_, i) => {
          const isCurrent = i === currentIndex;
          const isAnswered = i < answeredCount;

          return (
            <button
              key={i}
              onClick={() => onNavigate?.(i)}
              disabled={!onNavigate}
              className={`
                w-10 h-10 rounded-lg font-medium text-sm transition-all
                ${isCurrent
                  ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                  : isAnswered
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
                ${!onNavigate ? 'cursor-default' : 'cursor-pointer'}
              `}
              title={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}${isCurrent ? ' (current)' : ''}`}
              aria-label={`Question ${i + 1}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isAnswered && !isCurrent ? (
                <svg
                  className="w-5 h-5 mx-auto"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
