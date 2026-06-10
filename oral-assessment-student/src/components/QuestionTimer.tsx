/**
 * QuestionTimer - Countdown timer for per-question time limits.
 * Turns orange at ≤60 s remaining, red at ≤30 s remaining.
 * Flashes at ≤10 s, pulses at 0 s.
 * Calls onExpire when the countdown reaches zero.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { formatDuration } from '../utils/helpers';

interface QuestionTimerProps {
  /** Time limit in seconds. If undefined/null the timer is not shown. */
  timeLimitSeconds?: number | null;
  /** Called once when the countdown reaches zero. */
  onExpire?: () => void;
  /** Key that resets the timer when it changes (e.g. question ID). */
  resetKey?: string;
  /**
   * When true, the countdown freezes (e.g. oral recording is paused). This keeps
   * the header clock anchored to RECORDING-elapsed time — matching the recorder's
   * recordingDuration, which also excludes paused time — so the two never diverge
   * and the timer doesn't force-submit early after a pause.
   */
  paused?: boolean;
}

const ANNOUNCE_THRESHOLDS = new Set([30, 10, 0]);

export default function QuestionTimer({ timeLimitSeconds, onExpire, resetKey, paused = false }: QuestionTimerProps) {
  const [remaining, setRemaining] = useState<number>(timeLimitSeconds ?? 0);
  const expiredRef = useRef(false);
  const endTimeRef = useRef<number>(0);
  const pausedRef = useRef(paused);
  const pausedAtRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // Track pause transitions: while paused, the tick freezes; on resume we push the
  // end time forward by the paused duration so no recording time is silently burned.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      pausedAtRef.current = Date.now();
    } else if (pausedAtRef.current !== null) {
      endTimeRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [paused]);
  // Stable ref so the interval always calls the latest onExpire without re-creating
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Reset state when question changes (render-time pattern, avoids setState-in-effect)
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setRemaining(timeLimitSeconds ?? 0);
    setAnnouncement('');
  }

  const handleExpire = useCallback(() => {
    if (expiredRef.current) return; // prevent double-fire
    expiredRef.current = true;
    onExpireRef.current?.();
  }, []);

  // Tick down using Date.now() anchor for accuracy
  useEffect(() => {
    expiredRef.current = false;
    pausedAtRef.current = null;
    if (!timeLimitSeconds) return;
    endTimeRef.current = Date.now() + timeLimitSeconds * 1000;

    const interval = setInterval(() => {
      // Freeze while paused — endTimeRef is pushed forward on resume so the
      // remaining time is preserved exactly (recording-elapsed, not wall-clock).
      if (pausedRef.current) return;

      const now = Date.now();
      const secsLeft = Math.max(0, Math.round((endTimeRef.current - now) / 1000));

      setRemaining(secsLeft);

      if (ANNOUNCE_THRESHOLDS.has(secsLeft)) {
        if (secsLeft === 0) {
          setAnnouncement("Time's up!");
        } else {
          setAnnouncement(`${secsLeft} seconds remaining`);
        }
      }

      if (secsLeft <= 0) {
        clearInterval(interval);
        handleExpire();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [timeLimitSeconds, resetKey, handleExpire]);

  if (!timeLimitSeconds) return null;

  const isWarning = remaining <= 60 && remaining > 30;
  const isDanger  = remaining <= 30;
  const isCritical = remaining <= 10;
  const isExpired = remaining === 0;

  const colorClass = isExpired
    ? 'text-red-700 border-red-500 bg-red-100 animate-pulse'
    : isCritical
    ? 'text-red-600 border-red-300 bg-red-50 animate-[pulse_0.5s_ease-in-out_infinite]'
    : isDanger
    ? 'text-red-600 border-red-300 bg-red-50'
    : isWarning
    ? 'text-orange-500 border-orange-300 bg-orange-50'
    : 'text-gray-700 border-gray-200 bg-white';

  return (
    <>
      <div
        role="timer"
        className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full border text-sm font-mono font-semibold ${colorClass}`}
      >
        {/* Clock icon */}
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{formatDuration(remaining)}</span>
        {isExpired && (
          <span className="text-xs font-normal font-sans">Time&apos;s up!</span>
        )}
        {isCritical && !isExpired && (
          <span className="text-xs font-normal font-sans">Time almost up!</span>
        )}
      </div>
      {/* Screen-reader announcements only at thresholds */}
      <span className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </span>
    </>
  );
}
