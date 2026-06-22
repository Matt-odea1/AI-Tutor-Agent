/**
 * Offline-aware deferral for the per-question timer expiry.
 *
 * Extracted from TakeAssessment so the "don't submit while offline, defer until
 * reconnect, fire exactly once, never double-submit" logic is pure and unit
 * testable. The cardinal rule (same as runTimerExpiry): NEVER lose a real answer.
 * When offline at expiry we stop the recording (the store keeps recordedBlob),
 * warn the student, and register a one-shot `online` listener that re-runs the
 * expiry decision once connectivity returns.
 */

export interface OfflineDeferDeps {
  /** True when an upload/submit/stop is already in flight — re-entrancy guard. */
  isInFlight: () => boolean;
  /** True when currently recording (read lazily so the stopped blob is seen). */
  isRecording: () => boolean;
  answerMode: 'oral' | 'written';
  /** Stop an in-progress recording (resolves once the blob is captured). */
  stopRecording: () => Promise<void>;
  /** User-facing offline message (wired to a warning toast). */
  notify: (message: string) => void;
  /**
   * Register a one-shot listener that runs `run` exactly once on reconnect.
   * Returns an unregister fn. The implementation guards against a flapping
   * connection double-firing and re-checks the in-flight guard before running.
   */
  registerReconnect: (run: () => void) => void;
  /** The expiry action to (re-)run once online — typically handleTimerExpire. */
  runOnReconnect: () => void;
}

export const OFFLINE_DEFER_MESSAGE =
  'You appear to be offline — your answer is saved and will submit when you reconnect.';

/**
 * Handle a timer expiry that occurred while offline. Returns true if the submit
 * was deferred (so the caller should NOT proceed with the normal online path),
 * false if nothing to do (already in flight).
 */
export async function deferSubmitWhileOffline(deps: OfflineDeferDeps): Promise<boolean> {
  if (deps.isInFlight()) return true; // already submitting — don't stack a deferral
  if (deps.answerMode === 'oral' && deps.isRecording()) {
    await deps.stopRecording();
  }
  deps.notify(OFFLINE_DEFER_MESSAGE);
  deps.registerReconnect(deps.runOnReconnect);
  return true;
}
