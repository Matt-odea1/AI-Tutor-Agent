/**
 * Per-question timer-expiry orchestration.
 *
 * Extracted from TakeAssessment's handleTimerExpire so the decision logic is
 * pure and unit-testable. The cardinal rule: NEVER destroy a real answer at
 * expiry. Navigation is forward-only and server-driven, so a question burned
 * with a junk answer is lost permanently.
 *
 * Decision (always taken on FRESH state, i.e. re-read AFTER stopRecording):
 *  - oral + any captured audio   -> submit audio (never a text placeholder)
 *  - written + any non-empty text -> submit that text verbatim (no length floor)
 *  - otherwise                    -> explicit skip carrying the mode
 *                                    (so the store records a non-answer, not
 *                                     a fake '(time expired)' for oral)
 */

export interface TimerExpiryDeps {
  /** True when an upload/submit is already in flight — re-entrancy guard. */
  inFlight: boolean;
  answerMode: 'oral' | 'written';
  /** Lazy reads so callers re-read store state AFTER stopRecording. */
  getIsRecording: () => boolean;
  getRecordedBlob: () => Blob | null;
  getTextAnswer: () => string;
  /** Stop an in-progress recording (resolves once the blob is captured). */
  stopRecording: () => Promise<void>;
  /** User-facing "time's up" message (wired to a toast). */
  notify: (message: string) => void;
  /** Submit the captured audio answer. */
  submitAudio: () => Promise<void>;
  /** Submit the typed text answer. */
  submitText: () => Promise<void>;
  /** Record an explicit non-answer for the given mode. */
  skip: (mode: 'oral' | 'written') => Promise<void>;
}

export async function runTimerExpiry(deps: TimerExpiryDeps): Promise<void> {
  // Re-entrancy: if a submission is already running, do nothing (no double-submit).
  if (deps.inFlight) return;

  // Oral: stop any active recording FIRST so the blob is captured before we read it.
  // We must NOT gate the submit on a snapshot taken before stopRecording — that is
  // exactly the bug that burned actively-recording answers.
  if (deps.answerMode === 'oral' && deps.getIsRecording()) {
    await deps.stopRecording();
  }

  if (deps.answerMode === 'oral') {
    if (deps.getRecordedBlob()) {
      deps.notify("Time's up! Submitting your audio answer.");
      await deps.submitAudio();
    } else {
      // Genuinely no audio — student never recorded anything.
      deps.notify("Time's up! No answer recorded — moving on.");
      await deps.skip('oral');
    }
    return;
  }

  // Written: submit any non-empty trimmed text verbatim (no >= 20 char threshold).
  if (deps.getTextAnswer().trim().length > 0) {
    deps.notify("Time's up! Submitting your written answer.");
    await deps.submitText();
  } else {
    deps.notify("Time's up! No answer recorded — moving on.");
    await deps.skip('written');
  }
}
