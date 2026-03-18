/**
 * TextAnswerInput - Text area for written answers.
 */

interface TextAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  minLength?: number;
}

const MIN_CHARS = 20;

export default function TextAnswerInput({
  value,
  onChange,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  minLength = MIN_CHARS,
}: TextAnswerInputProps) {
  const canSubmit = value.trim().length >= minLength && !isSubmitting && !disabled;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Write Your Answer</h3>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isSubmitting}
        rows={8}
        placeholder="Type your answer here..."
        className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-400
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:bg-gray-50 disabled:cursor-not-allowed resize-y"
      />

      <div className="flex items-center justify-between mt-2 mb-4">
        <span className={`text-xs ${value.trim().length < minLength ? 'text-gray-400' : 'text-green-600'}`}>
          {value.trim().length} / {minLength} characters minimum
        </span>
        {value.trim().length > 0 && value.trim().length < minLength && (
          <span className="text-xs text-orange-500">
            {minLength - value.trim().length} more characters needed
          </span>
        )}
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center space-x-2 bg-green-600 text-white px-6 py-3
                   rounded-full hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                   transition-colors font-medium"
      >
        {isSubmitting ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Submitting...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd" />
            </svg>
            <span>Submit Answer</span>
          </>
        )}
      </button>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>Tips:</strong> Be thorough and explain your reasoning. Use correct terminology where appropriate.
        </p>
      </div>
    </div>
  );
}
