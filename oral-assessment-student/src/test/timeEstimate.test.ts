import { describe, it, expect } from 'vitest';
import { estimateTotalMinutes, estimateRemainingMinutes } from '../utils/timeEstimate';

describe('estimateTotalMinutes', () => {
  it('sums real per-question limits (preferred path)', () => {
    // 300 + 300 + 600 = 1200s = 20 min
    expect(
      estimateTotalMinutes({ questionCount: 3, perQuestionSeconds: [300, 300, 600] })
    ).toBe(20);
  });

  it('treats null / 0 / negative per-question entries as no limit for that question', () => {
    // only the 300s entry counts → 5 min
    expect(
      estimateTotalMinutes({ questionCount: 3, perQuestionSeconds: [null, 0, 300] })
    ).toBe(5);
  });

  it('returns null when every per-question entry has no limit', () => {
    expect(
      estimateTotalMinutes({ questionCount: 2, perQuestionSeconds: [null, undefined] })
    ).toBeNull();
  });

  it('falls back to count * representative limit when no per-question list is given', () => {
    // 5 questions * 120s = 600s = 10 min
    expect(
      estimateTotalMinutes({ questionCount: 5, fallbackPerQuestionSeconds: 120 })
    ).toBe(10);
  });

  it('prefers the per-question list over the fallback when both are present', () => {
    expect(
      estimateTotalMinutes({
        questionCount: 2,
        perQuestionSeconds: [300, 300], // 10 min
        fallbackPerQuestionSeconds: 9999,
      })
    ).toBe(10);
  });

  it('returns null when there is no per-question limit at all', () => {
    expect(estimateTotalMinutes({ questionCount: 4 })).toBeNull();
  });

  it('returns null when the fallback limit is present but questionCount is 0', () => {
    expect(
      estimateTotalMinutes({ questionCount: 0, fallbackPerQuestionSeconds: 300 })
    ).toBeNull();
  });

  it('rounds to the nearest minute and never reports 0 for a real limit', () => {
    // 1 question * 20s = 20s → rounds to 0 but is floored up to 1 min
    expect(
      estimateTotalMinutes({ questionCount: 1, fallbackPerQuestionSeconds: 20 })
    ).toBe(1);
  });

  it('is defensive against non-finite / negative inputs', () => {
    expect(
      estimateTotalMinutes({
        questionCount: -3,
        fallbackPerQuestionSeconds: Number.NaN,
      })
    ).toBeNull();
    expect(
      estimateTotalMinutes({ questionCount: 2, perQuestionSeconds: [Number.POSITIVE_INFINITY, -5] })
    ).toBeNull();
  });

  it('handles an empty per-question list by falling through to the fallback', () => {
    expect(
      estimateTotalMinutes({
        questionCount: 3,
        perQuestionSeconds: [],
        fallbackPerQuestionSeconds: 60,
      })
    ).toBe(3);
  });
});

describe('estimateRemainingMinutes', () => {
  it('sums limits from the current index onward (position aware)', () => {
    // at index 1 of [300,300,600] → remaining 300+600 = 900s = 15 min
    expect(
      estimateRemainingMinutes({
        questionCount: 3,
        currentIndex: 1,
        perQuestionSeconds: [300, 300, 600],
      })
    ).toBe(15);
  });

  it('uses the fallback * remaining-count when no list is supplied', () => {
    // 5 questions, at index 2 → 3 remaining * 120s = 360s = 6 min
    expect(
      estimateRemainingMinutes({
        questionCount: 5,
        currentIndex: 2,
        fallbackPerQuestionSeconds: 120,
      })
    ).toBe(6);
  });

  it('returns 0 when the student is past the last question (fallback path)', () => {
    expect(
      estimateRemainingMinutes({
        questionCount: 3,
        currentIndex: 3,
        fallbackPerQuestionSeconds: 120,
      })
    ).toBe(0);
  });

  it('returns null when there is no per-question limit', () => {
    expect(
      estimateRemainingMinutes({ questionCount: 4, currentIndex: 0 })
    ).toBeNull();
  });

  it('clamps an out-of-range / missing currentIndex', () => {
    // negative clamps to 0 → full remaining
    expect(
      estimateRemainingMinutes({
        questionCount: 2,
        currentIndex: -10,
        perQuestionSeconds: [300, 300],
      })
    ).toBe(10);
    // beyond the end clamps to length → nothing left
    expect(
      estimateRemainingMinutes({
        questionCount: 2,
        currentIndex: 99,
        perQuestionSeconds: [300, 300],
      })
    ).toBeNull();
  });
});
