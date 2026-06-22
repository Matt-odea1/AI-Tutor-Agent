/**
 * Utility functions for the student assessment app
 */

/**
 * Format seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Get grade from percentage
 */
export function getGradeFromPercentage(percentage: number): string {
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  return 'F';
}

/**
 * Get grade color class.
 *
 * Mapped onto the "quiet room" status tokens (success / accent / caution / danger)
 * so the letter-grade badge never reverts to the old bright green/blue/yellow ramp.
 */
export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-success bg-success/10';
    case 'B':
      return 'text-accent bg-accent/10';
    case 'C':
      return 'text-caution bg-caution/10';
    case 'D':
      return 'text-caution bg-caution/10';
    case 'F':
      return 'text-danger bg-danger/10';
    default:
      return 'text-slate bg-ink/5';
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'not-started':
      return 'bg-ink/5 text-slate';
    case 'in-progress':
      return 'bg-accent/10 text-accent';
    case 'submitted':
      return 'bg-success/10 text-success';
    case 'evaluated':
      return 'bg-caution/10 text-caution';
    default:
      return 'bg-ink/5 text-slate';
  }
}

/**
 * Validate student ID format
 */
export function validateStudentId(studentId: string): boolean {
  // Basic validation - adjust based on your ID format
  return studentId.length > 0 && studentId.length <= 50;
}

/**
 * Validate assessment ID format (UUID)
 */
export function validateAssessmentId(assessmentId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(assessmentId);
}

/**
 * sessionStorage key recording that the student originally DECLINED webcam
 * recording for this assessment. Persisted so a mid-exam refresh restores the
 * "declined" intent (the React-only proctoringDeclined flag is lost on remount),
 * letting the resume re-arm correctly skip re-requesting the camera.
 */
export function declinedConsentKey(assessmentId: string): string {
  return `declined_consent_${assessmentId}`;
}

/**
 * True when the student previously declined recording for this assessment.
 * Single source of truth for both persisting and reading the decline so the
 * write key and the resume-effect read key can never drift apart.
 */
export function hasDeclinedConsent(assessmentId: string | null | undefined): boolean {
  if (!assessmentId) return false;
  return sessionStorage.getItem(declinedConsentKey(assessmentId)) === 'true';
}

/**
 * Parse URL parameters
 */
export function parseUrlParams(pathname: string): { studentId: string; assessmentId: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  
  if (parts.length >= 2) {
    return {
      studentId: parts[0],
      assessmentId: parts[1],
    };
  }
  
  return null;
}

/**
 * Check if browser supports required features
 */
export function checkBrowserSupport(): {
  supported: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    missing.push('MediaDevices API');
  }

  if (!window.MediaRecorder) {
    missing.push('MediaRecorder API');
  }

  if (!window.AudioContext && !(window as Window & { webkitAudioContext?: unknown }).webkitAudioContext) {
    missing.push('AudioContext API');
  }

  return {
    supported: missing.length === 0,
    missing,
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Get grade color class for backend band grades (Excellent / Competent / Developing / Unsatisfactory).
 *
 * Mapped onto the "quiet room" status tokens (success / accent / caution / danger)
 * as restrained tints — a soft token-tinted surface with a token-coloured numeral,
 * never the old bright green/blue/yellow/red ramp.
 */
export function getBandGradeColor(grade: string): string {
  switch (grade) {
    case 'Excellent': return 'text-success bg-success/10';
    case 'Competent': return 'text-accent bg-accent/10';
    case 'Developing': return 'text-caution bg-caution/10';
    case 'Unsatisfactory': return 'text-danger bg-danger/10';
    default: return 'text-slate bg-ink/5';
  }
}

/**
 * Get difficulty badge color
 */
export function getDifficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return 'bg-success/10 text-success';
    case 'medium':
      return 'bg-caution/10 text-caution';
    case 'hard':
      return 'bg-danger/10 text-danger';
    default:
      return 'bg-ink/5 text-slate';
  }
}

export default {
  formatDuration,
  formatDate,
  formatTimestamp,
  calculatePercentage,
  getGradeFromPercentage,
  getGradeColor,
  getBandGradeColor,
  getStatusColor,
  validateStudentId,
  validateAssessmentId,
  parseUrlParams,
  checkBrowserSupport,
  truncate,
  capitalize,
  getDifficultyColor,
};
