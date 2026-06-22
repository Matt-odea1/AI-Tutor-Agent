/**
 * Pure helpers for the whole-assessment time estimate (P9).
 *
 * The student only ever sees a per-question time limit elsewhere; these helpers
 * roll that up into a coarse "estimated total" figure shown on the pre-assessment
 * overview and a remaining-time hint in the in-assessment header. They are pure
 * (no React, no storage, no network) so the arithmetic is unit-testable in
 * isolation — the spec requires the estimate logic to be extracted and tested.
 *
 * Definition of "the estimate":
 *   - Prefer real per-question limits when the caller can supply them: sum every
 *     positive per-question limit (questions with no limit contribute nothing).
 *   - Otherwise fall back to `questionCount * perQuestionLimitMinutes` when a
 *     single representative per-question limit is known.
 *   - When NO per-question limit is known anywhere, there is no time limit and the
 *     estimate is `null` (callers render "No time limit" and omit the figure).
 *
 * All inputs are defensive: undefined / null / non-finite / negative values are
 * treated as "no limit" and never throw.
 */

/** A finite, strictly-positive number, else null. */
function positiveOrNull(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Estimate the total assessment time IN MINUTES, or null when no per-question
 * limit is known (so there is effectively no time limit to estimate).
 *
 * @param opts.questionCount        number of questions (defaults to 0)
 * @param opts.perQuestionSeconds   per-question limits in SECONDS, one entry per
 *                                  question when the caller has them (preferred).
 *                                  Entries that are null/0/negative count as "no
 *                                  limit for that question" and add nothing.
 * @param opts.fallbackPerQuestionSeconds  a single representative per-question
 *                                  limit in SECONDS used only when
 *                                  `perQuestionSeconds` is absent/empty.
 */
export function estimateTotalMinutes(opts: {
  questionCount?: number;
  perQuestionSeconds?: Array<number | null | undefined>;
  fallbackPerQuestionSeconds?: number | null;
}): number | null {
  const { perQuestionSeconds, fallbackPerQuestionSeconds } = opts;
  const questionCount = positiveOrNull(opts.questionCount) ?? 0;

  // Preferred path: sum real per-question limits when supplied.
  if (perQuestionSeconds && perQuestionSeconds.length > 0) {
    const totalSeconds = perQuestionSeconds.reduce<number>(
      (sum, s) => sum + (positiveOrNull(s) ?? 0),
      0
    );
    if (totalSeconds <= 0) return null; // no question carried a real limit
    return Math.max(1, Math.round(totalSeconds / 60));
  }

  // Fallback: a single representative per-question limit × question count.
  const fallback = positiveOrNull(fallbackPerQuestionSeconds);
  if (fallback === null || questionCount <= 0) return null;
  return Math.max(1, Math.round((fallback * questionCount) / 60));
}

/**
 * Estimate the time REMAINING IN MINUTES for the questions not yet reached, given
 * the same inputs plus how many questions are already behind the student. Returns
 * null when there is no per-question limit (no estimate possible). Floors at 0.
 *
 * When `perQuestionSeconds` is supplied we sum the limits of the questions from
 * `answeredOrPassed` onward (real, position-aware). Otherwise we fall back to
 * `remainingQuestions * fallbackPerQuestionSeconds`.
 */
export function estimateRemainingMinutes(opts: {
  questionCount?: number;
  currentIndex?: number;
  perQuestionSeconds?: Array<number | null | undefined>;
  fallbackPerQuestionSeconds?: number | null;
}): number | null {
  const { perQuestionSeconds, fallbackPerQuestionSeconds } = opts;
  const questionCount = positiveOrNull(opts.questionCount) ?? 0;
  // Clamp currentIndex into [0, questionCount].
  const rawIndex = typeof opts.currentIndex === 'number' && Number.isFinite(opts.currentIndex)
    ? opts.currentIndex
    : 0;
  const currentIndex = Math.min(Math.max(0, Math.trunc(rawIndex)), questionCount);

  if (perQuestionSeconds && perQuestionSeconds.length > 0) {
    const remainingSeconds = perQuestionSeconds
      .slice(currentIndex)
      .reduce<number>((sum, s) => sum + (positiveOrNull(s) ?? 0), 0);
    if (remainingSeconds <= 0) return null;
    return Math.max(0, Math.round(remainingSeconds / 60));
  }

  const fallback = positiveOrNull(fallbackPerQuestionSeconds);
  if (fallback === null) return null;
  const remainingQuestions = Math.max(0, questionCount - currentIndex);
  if (remainingQuestions <= 0) return 0;
  return Math.max(1, Math.round((fallback * remainingQuestions) / 60));
}
