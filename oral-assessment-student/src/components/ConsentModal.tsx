/**
 * ConsentModal — shown before the assessment starts.
 * Student must acknowledge that their webcam is recorded throughout the session.
 */
import { useRef, useEffect } from 'react';

interface ConsentModalProps {
  onConsent: () => void;
  onDecline: () => void;
  isRequestingPermission?: boolean;
}

export default function ConsentModal({
  onConsent,
  onDecline,
  isRequestingPermission = false,
}: ConsentModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-14 h-14 bg-primary-100 rounded-full mx-auto mb-4">
          <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.868V15.13a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>

        <h2 id="consent-title" className="text-xl font-bold text-gray-900 text-center mb-2">
          Proctoring Consent
        </h2>
        <p className="text-gray-600 text-sm text-center mb-4">
          This assessment requires your webcam and microphone throughout the session.
        </p>

        <ul className="text-sm text-gray-700 space-y-2 mb-6 bg-gray-50 rounded-lg p-4">
          <li className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Your webcam footage is uploaded securely, accessible only to your instructor, and retained for 12 months.</span>
          </li>
          <li className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>A small preview is shown bottom-right so you can confirm your camera is working.</span>
          </li>
          <li className="flex items-start space-x-2">
            <svg className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>If you revoke camera access mid-session, the assessment will be paused.</span>
          </li>
        </ul>

        <p className="text-xs text-gray-500 text-center mb-3">
          Choosing "Continue without recording" lets you complete the assessment without camera — your answers will still be submitted normally.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={onDecline}
            disabled={isRequestingPermission}
            className="flex-1 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors font-medium"
          >
            Continue without recording
          </button>
          <button
            onClick={onConsent}
            disabled={isRequestingPermission}
            className="flex-1 bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 disabled:bg-gray-400 transition-colors font-medium flex items-center justify-center space-x-2"
          >
            {isRequestingPermission ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Requesting…</span>
              </>
            ) : (
              <span>I Consent — Start Assessment</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
