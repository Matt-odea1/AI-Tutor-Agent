import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ErrorMessage from '../components/ErrorMessage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email });
      setSubmitted(true);
    } catch {
      // Always show success to prevent email enumeration
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const errorId = error ? 'forgot-password-error' : undefined;

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="bg-paper border border-hairline rounded-xl p-8 w-full max-w-md">
        <h1 className="font-serif text-2xl font-semibold text-ink mb-2">Reset Password</h1>
        <p className="text-slate text-sm mb-6">
          Enter your email address and we'll send you a reset link.
        </p>

        {submitted ? (
          <div className="text-center">
            <div
              role="status"
              aria-live="polite"
              className="bg-success/10 border border-success/30 rounded-xl p-4 mb-6"
            >
              <p className="text-success text-sm">
                If an account with that email exists, a reset link has been sent. Check your inbox.
              </p>
            </div>
            <Link to="/login" className="text-accent hover:text-accent-hover text-sm font-medium">
              ← Back to Sign In
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div id={errorId} role="alert" className="mb-4">
                <ErrorMessage error={error} onDismiss={() => setError(null)} />
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={errorId}
                  className="w-full px-4 py-2 bg-ink/5 border border-hairline rounded-xl text-ink placeholder-slate focus:border-accent focus:ring-2 focus:ring-accent focus:outline-none"
                  placeholder="you@university.edu"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full bg-accent hover:bg-accent-hover text-white py-2.5 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-accent hover:text-accent-hover text-sm font-medium">
                ← Back to Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
