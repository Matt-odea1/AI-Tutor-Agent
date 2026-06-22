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
 * Get grade color class
 */
export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-green-600 bg-green-100';
    case 'B':
      return 'text-blue-600 bg-blue-100';
    case 'C':
      return 'text-yellow-600 bg-yellow-100';
    case 'D':
      return 'text-orange-600 bg-orange-100';
    case 'F':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'not-started':
      return 'bg-gray-100 text-gray-800';
    case 'in-progress':
      return 'bg-blue-100 text-blue-800';
    case 'submitted':
      return 'bg-green-100 text-green-800';
    case 'evaluated':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
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
 * Get grade color class for backend band grades (Excellent / Competent / Developing / Unsatisfactory)
 */
export function getBandGradeColor(grade: string): string {
  switch (grade) {
    case 'Excellent': return 'text-green-600 bg-green-100';
    case 'Competent': return 'text-blue-600 bg-blue-100';
    case 'Developing': return 'text-yellow-600 bg-yellow-100';
    case 'Unsatisfactory': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
}

/**
 * Get difficulty badge color
 */
export function getDifficultyColor(difficulty: string): string {
  switch (difficulty.toLowerCase()) {
    case 'easy':
      return 'bg-green-100 text-green-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'hard':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
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
