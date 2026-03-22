/**
 * QuestionTimer - Countdown timer for per-question time limits.
 * Turns orange at ≤60 s remaining, red at ≤30 s remaining.
 * Calls onExpire when the countdown reaches zero.
 */

import { useEffect, useState } from 'react';
import { formatDuration } from '../utils/helpers';

interface QuestionTimerProps {
  /** Time limit in seconds. If undefined/null the timer is not shown. */
  timeLimitSeconds?: number | null;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Key that resets the timer when it changes (e.g. question ID). */
  resetKey?: string;
}

export default function QuestionTimer({ timeLimitSeconds, onExpire, resetKey }: QuestionTimerProps) {
  const [remaining, setRemaining] = useState<number>(timeLimitSeconds ?? 0);

  // Reset whenever the question or limit changes
  useEffect(() => {
    setRemaining(timeLimitSeconds ?? 0);
  }, [timeLimitSeconds, resetKey]);

  // Tick down
  useEffect(() => {
    if (!timeLimitSeconds) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLimitSeconds, resetKey]);

  if (!timeLimitSeconds) return null;

  const isWarning = remaining <= 60 && remaining > 30;
  const isDanger  = remaining <= 30;

  const colorClass = isDanger
    ? 'text-red-600 border-red-300 bg-red-50'
    : isWarning
    ? 'text-orange-500 border-orange-300 bg-orange-50'
    : 'text-gray-700 border-gray-200 bg-white';

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-atomic="true"
      className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border text-sm font-mono font-semibold ${colorClass}`}
    >
      {/* Clock icon */}
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{formatDuration(remaining)}</span>
      {isDanger && (
        <span className="text-xs font-normal">Time almost up!</span>
      )}
    </div>
  );
}
