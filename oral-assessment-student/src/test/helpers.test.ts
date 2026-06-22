import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatDuration,
  getGradeFromPercentage,
  getGradeColor,
  getBandGradeColor,
  calculatePercentage,
  truncate,
  capitalize,
  validateStudentId,
  validateAssessmentId,
  declinedConsentKey,
  hasDeclinedConsent,
} from '../utils/helpers';

describe('formatDuration', () => {
  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exactly one minute', () => {
    expect(formatDuration(60)).toBe('1:00');
  });

  it('pads seconds with leading zero', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('getGradeFromPercentage', () => {
  it('returns A for >=90', () => {
    expect(getGradeFromPercentage(90)).toBe('A');
    expect(getGradeFromPercentage(100)).toBe('A');
  });

  it('returns B for 80-89', () => {
    expect(getGradeFromPercentage(80)).toBe('B');
    expect(getGradeFromPercentage(89)).toBe('B');
  });

  it('returns F for <60', () => {
    expect(getGradeFromPercentage(59)).toBe('F');
    expect(getGradeFromPercentage(0)).toBe('F');
  });
});

describe('getGradeColor', () => {
  it('returns the success token for A', () => {
    expect(getGradeColor('A')).toContain('success');
  });

  it('returns the danger token for F', () => {
    expect(getGradeColor('F')).toContain('danger');
  });

  it('returns the neutral slate token for an unknown grade', () => {
    expect(getGradeColor('Z')).toContain('slate');
  });
});

describe('getBandGradeColor', () => {
  it('maps Excellent onto the success token (not legacy green-600)', () => {
    const cls = getBandGradeColor('Excellent');
    expect(cls).toContain('success');
    expect(cls).not.toMatch(/green-\d/);
  });

  it('maps Competent onto the accent token (not legacy blue)', () => {
    const cls = getBandGradeColor('Competent');
    expect(cls).toContain('accent');
    expect(cls).not.toMatch(/blue/);
  });

  it('maps Developing onto the caution token (not legacy yellow)', () => {
    const cls = getBandGradeColor('Developing');
    expect(cls).toContain('caution');
    expect(cls).not.toMatch(/yellow/);
  });

  it('maps Unsatisfactory onto the danger token (not legacy red-600)', () => {
    const cls = getBandGradeColor('Unsatisfactory');
    expect(cls).toContain('danger');
    expect(cls).not.toMatch(/red-\d/);
  });

  it('falls back to a neutral ink/slate treatment for unknown bands', () => {
    const cls = getBandGradeColor('Mystery');
    expect(cls).toContain('slate');
    expect(cls).not.toMatch(/gray-\d/);
  });

  it('uses soft token tints, never the bright legacy ramp', () => {
    for (const band of ['Excellent', 'Competent', 'Developing', 'Unsatisfactory']) {
      const cls = getBandGradeColor(band);
      expect(cls).not.toMatch(/-100\b/); // no old bg-*-100 surfaces
    }
  });
});

describe('calculatePercentage', () => {
  it('calculates correct percentage', () => {
    expect(calculatePercentage(7, 10)).toBe(70);
  });

  it('returns 0 when total is 0', () => {
    expect(calculatePercentage(5, 0)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(calculatePercentage(1, 3)).toBe(33);
  });
});

describe('truncate', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    const result = truncate('hello world', 8);
    expect(result).toBe('hello...');
    expect(result.length).toBe(8);
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('validateStudentId', () => {
  it('accepts valid student IDs', () => {
    expect(validateStudentId('z5000001')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateStudentId('')).toBe(false);
  });
});

describe('validateAssessmentId', () => {
  it('accepts valid UUID', () => {
    expect(validateAssessmentId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-UUID', () => {
    expect(validateAssessmentId('not-a-uuid')).toBe(false);
  });
});

describe('declined-consent persistence (mid-exam refresh)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('builds a per-assessment-scoped key', () => {
    expect(declinedConsentKey('a1')).toBe('declined_consent_a1');
    // Distinct assessments do not collide.
    expect(declinedConsentKey('a1')).not.toBe(declinedConsentKey('a2'));
  });

  it('hasDeclinedConsent is false before any decline is persisted', () => {
    expect(hasDeclinedConsent('a1')).toBe(false);
  });

  it('reads back a persisted decline so the resume re-arm skips re-requesting the camera', () => {
    // Mirrors handleConsentDeclined / handleContinueWithoutRecording writing the key.
    sessionStorage.setItem(declinedConsentKey('a1'), 'true');
    expect(hasDeclinedConsent('a1')).toBe(true);
  });

  it('does not leak a decline across assessments', () => {
    sessionStorage.setItem(declinedConsentKey('a1'), 'true');
    expect(hasDeclinedConsent('a2')).toBe(false);
  });

  it('is false for a null/undefined assessmentId (no premature read)', () => {
    expect(hasDeclinedConsent(null)).toBe(false);
    expect(hasDeclinedConsent(undefined)).toBe(false);
  });
});
