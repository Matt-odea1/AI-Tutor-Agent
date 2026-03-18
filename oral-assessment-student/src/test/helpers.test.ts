import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  getGradeFromPercentage,
  getGradeColor,
  calculatePercentage,
  truncate,
  capitalize,
  validateStudentId,
  validateAssessmentId,
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
  it('returns green class for A', () => {
    expect(getGradeColor('A')).toContain('green');
  });

  it('returns red class for F', () => {
    expect(getGradeColor('F')).toContain('red');
  });

  it('returns default for unknown grade', () => {
    expect(getGradeColor('Z')).toContain('gray');
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
