/**
 * HelpButton — a persistent, reusable "?" affordance (P9).
 *
 * A small circular button that opens a modal with troubleshooting guidance for the
 * three most common failure modes (microphone, camera, upload/connection) plus a
 * support/contact block. It is rendered on the invite screen (where a student who
 * can't even exchange their token still needs somewhere to turn) and in the
 * in-assessment header.
 *
 * The modal reuses the focus-trap + overlay pattern from ConsentModal so keyboard
 * users stay trapped inside the dialog while it's open, and matches the existing
 * Tailwind tokens (`bg-white rounded-2xl shadow-xl`, `primary-*`).
 *
 * Contact info NEVER hardcodes a real person: it comes purely from the optional
 * props (sourced from backend data — see the assumed contract on QuestionsResponse /
 * Assessment) and degrades to generic copy when nothing is supplied.
 */
import { useEffect, useRef, useState } from 'react';

interface HelpButtonProps {
  /** Instructor display name, when the backend supplies it. */
  instructorName?: string;
  /** Support email — rendered as a `mailto:` link when present. */
  supportEmail?: string;
  /** Support URL — rendered as an external link when present. */
  supportUrl?: string;
  /** Optional extra classes for the trigger button positioning (e.g. absolute placement). */
  className?: string;
}

export default function HelpButton({
  instructorName,
  supportEmail,
  supportUrl,
  className = '',
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape-to-close while the dialog is open. Mirrors ConsentModal's
  // pattern; additionally returns focus to the trigger on close (the trigger is a
  // persistent control, unlike ConsentModal which unmounts entirely).
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
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
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const hasDirectContact = Boolean(supportEmail || supportUrl);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Get help"
        title="Get help"
        className={`inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors ${className}`}
      >
        <span className="text-lg font-semibold leading-none" aria-hidden="true">?</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50"
          onClick={handleClose}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="help-title" className="text-xl font-bold text-gray-900">
                Need help?
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close help"
                className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              Trouble with your microphone, camera, or submitting an answer? Try the
              steps below.
            </p>

            <div className="space-y-4">
              {/* Microphone */}
              <section className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  Microphone not detected or no sound
                </h3>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Check that your microphone is allowed in your operating system's privacy/sound settings.</li>
                  <li>Allow microphone access for this site in your browser (click the lock icon in the address bar).</li>
                  <li>Make sure the correct input device is selected and not muted, then reload the page.</li>
                </ul>
              </section>

              {/* Camera */}
              <section className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  Camera blocked or access revoked
                </h3>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Click the lock icon in your browser's address bar and re-grant camera (and microphone) access for this site.</li>
                  <li>Then use the on-screen "Restore camera" prompt to resume recording.</li>
                  <li>Close other apps that may be using your camera, then try again.</li>
                </ul>
              </section>

              {/* Upload / connection */}
              <section className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  An answer won't submit
                </h3>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Check your internet connection.</li>
                  <li>Wait a moment and retry — submitting will resume automatically when you reconnect.</li>
                  <li>Your recording is preserved while you retry, so you won't lose your answer.</li>
                </ul>
              </section>
            </div>

            {/* Support / contact block */}
            <section className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Still stuck?</h3>
              {hasDirectContact ? (
                <div className="text-sm text-gray-600 space-y-1">
                  {instructorName && (
                    <p>
                      Contact <span className="font-medium text-gray-800">{instructorName}</span> for help.
                    </p>
                  )}
                  {supportEmail && (
                    <p>
                      Email:{' '}
                      <a
                        href={`mailto:${supportEmail}`}
                        className="text-primary-600 hover:text-primary-700 underline break-all"
                      >
                        {supportEmail}
                      </a>
                    </p>
                  )}
                  {supportUrl && (
                    <p>
                      Support page:{' '}
                      <a
                        href={supportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 underline break-all"
                      >
                        {supportUrl}
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  {instructorName ? (
                    <>
                      Contact <span className="font-medium text-gray-800">{instructorName}</span> or your
                      course administrator for help with your invite link.
                    </>
                  ) : (
                    <>Contact your instructor or course administrator for help with your invite link.</>
                  )}
                </p>
              )}
            </section>

            <button
              type="button"
              onClick={handleClose}
              className="mt-6 w-full bg-primary-600 text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
