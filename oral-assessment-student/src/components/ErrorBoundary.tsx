/**
 * ErrorBoundary - Catches React errors and displays fallback UI
 */

import React, { Component } from 'react';
import type { ReactNode } from 'react';
import useAssessmentStore from '../store/assessmentStore';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  // Soft recovery: clear the error and re-render children WITHOUT a full page
  // reload, which would wipe all in-memory Zustand state. The store (and the
  // IndexedDB/sessionStorage draft) survive a re-render, so an unsubmitted
  // answer is preserved. A hard reload remains available as a fallback.
  handleTryRecover = () => {
    // Read imperatively — a class component can't use the Zustand hook. clearError
    // is always defined; optional-chained purely defensively.
    useAssessmentStore.getState().clearError?.();
    this.setState({ hasError: false, error: null });
  };

  /**
   * Does the student likely have unsubmitted work in memory right now? Read the
   * store imperatively (this is a class component mounted above the router). A
   * recorded-but-not-uploaded blob or a non-empty typed answer both qualify; both
   * have also been persisted durably, so they can be recovered after a reload.
   */
  private hasUnsavedWork(): boolean {
    try {
      const { recordedBlob, textAnswer } = useAssessmentStore.getState();
      return recordedBlob !== null || textAnswer.trim() !== '';
    } catch {
      return false;
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const unsavedWork = this.hasUnsavedWork();

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900 text-center">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-gray-600 text-center">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {unsavedWork ? (
              <>
                <p className="mt-4 text-sm text-amber-800 text-center bg-amber-50 border border-amber-200 rounded-md p-3">
                  You have an unsubmitted answer. It has been saved on this device,
                  so you can try to recover without losing it. Reloading the page
                  is also safe — your answer will be restored afterwards.
                </p>
                <button
                  onClick={this.handleTryRecover}
                  className="mt-6 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Try to recover
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Reload Page
                </button>
              </>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="mt-6 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
