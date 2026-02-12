import { useState } from 'react'

interface LoginGateProps {
  onLogin: (email: string) => Promise<void>
}

export const LoginGate = ({ onLogin }: LoginGateProps) => {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    if (!isValid) {
      setError('Enter a valid email address.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await onLogin(trimmed)
    } catch {
      setError('Unable to sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Welcome</h1>
          <p className="text-sm text-gray-500">Enter your email to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
