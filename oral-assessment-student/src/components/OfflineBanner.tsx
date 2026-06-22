/**
 * OfflineBanner - always-mounted, only visible when the browser is offline.
 *
 * Driven by the store's `isOnline` flag (navigator.onLine + online/offline
 * events). Sits near the global ToastContainer so it appears on every route.
 * Warning palette, consistent with ErrorMessage's visual language.
 */

import { useEffect } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';

export default function OfflineBanner() {
  const isOnline = useAssessmentStore((s) => s.isOnline);
  const initNetworkListeners = useAssessmentStore((s) => s.initNetworkListeners);

  // Register online/offline listeners once for the lifetime of the app.
  useEffect(() => {
    const cleanup = initNetworkListeners();
    return cleanup;
  }, [initNetworkListeners]);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2"
    >
      <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-800">
        <svg
          className="h-4 w-4 flex-shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 12h.01"
          />
        </svg>
        <span>
          You appear to be offline. Your answers are saved and will submit when you reconnect.
        </span>
      </div>
    </div>
  );
}
