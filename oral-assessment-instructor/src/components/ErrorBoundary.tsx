/**
 * ErrorBoundary - Catches React errors and displays fallback UI
 *
 * Ported from the student app (same props, same default export). Mounted as the
 * outermost element inside BrowserRouter in App.tsx, so a render crash on any
 * instructor screen shows this card instead of a blank white page.
 *
 * The student version additionally warns about an unsubmitted answer held in its
 * store; the instructor app has no equivalent in-memory artefact (its forms post
 * on submit), so recovery here is just "clear the error and re-render" with a
 * hard reload as the fallback.
 */

import React, { Component } from 'react';
import type { ReactNode } from 'react';
import { useAssessmentStore } from '../store/assessmentStore';

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
  // reload, which would wipe all in-memory Zustand state (the loaded assessment
  // list, the selected assessment, any fetched results). A hard reload remains
  // available as a fallback.
  handleTryRecover = () => {
    // Read imperatively — a class component can't use the Zustand hook.
    useAssessmentStore.getState().setError?.(null);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-paper flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-paper rounded-xl border border-hairline p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-danger/10 rounded-full">
              <svg
                className="w-6 h-6 text-danger"
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
            <h2 className="mt-4 text-xl font-semibold font-serif text-ink text-center">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-slate text-center">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            <button
              onClick={this.handleTryRecover}
              className="mt-6 w-full bg-accent text-white px-4 py-2 rounded-xl hover:bg-accent-hover transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 w-full bg-ink/5 text-slate px-4 py-2 rounded-xl hover:bg-ink/10 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
