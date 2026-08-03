/**
 * ErrorMessage - Display error messages
 *
 * Ported from the student app. Accepts either a plain string or anything with a
 * `message` field (an Error, an axios-normalised API error), so callers can pass
 * `err instanceof Error ? err : String(err)` straight through.
 *
 * The student app imports `ApiError` from its `types` module; the instructor app
 * has no local types module (it shares `shared/types/assessment.ts`, which has
 * no error type), so the minimal shape is declared and exported here.
 */

export interface ApiError {
  message: string;
}

interface ErrorMessageProps {
  error: ApiError | string;
  onDismiss?: () => void;
}

export default function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-danger"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-danger">Error</h3>
          <p className="mt-1 text-sm text-danger">{errorMessage}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="ml-auto flex-shrink-0 text-danger hover:text-danger/80"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
