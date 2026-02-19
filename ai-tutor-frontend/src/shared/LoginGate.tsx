import { useEffect, useRef, useState } from 'react'
import logo9021 from '../assets/9021logo.png'

interface LoginGateProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSignup: (email: string, password: string) => Promise<void>
  onGoogleLogin: (idToken: string) => Promise<void>
}

type AuthMode = 'login' | 'signup'

export const LoginGate = ({ onLogin, onSignup, onGoogleLogin }: LoginGateProps) => {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const googleInitializedRef = useRef(false)

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ''
  const isGoogleEnabled = googleClientId.length > 0

  useEffect(() => {
    if (!isGoogleEnabled) {
      return
    }

    const renderGoogleButton = () => {
      if (!window.google || !googleButtonRef.current || googleInitializedRef.current) {
        return
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          const credential = response?.credential?.trim()
          if (!credential) {
            setError('Google sign-in did not return a token.')
            return
          }

          setError(null)
          setIsSubmitting(true)
          try {
            await onGoogleLogin(credential)
          } catch (authError) {
            setError(authError instanceof Error ? authError.message : 'Google sign-in failed. Please try again.')
          } finally {
            setIsSubmitting(false)
          }
        },
      })

      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: '320',
      })

      googleInitializedRef.current = true
    }

    const existingScript = document.getElementById('google-identity-services') as HTMLScriptElement | null
    if (existingScript) {
      if (window.google) {
        renderGoogleButton()
      } else {
        existingScript.addEventListener('load', renderGoogleButton, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.id = 'google-identity-services'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => renderGoogleButton()
    script.onerror = () => setError('Unable to load Google sign-in. Please use email and password.')
    document.head.appendChild(script)
  }, [googleClientId, isGoogleEnabled, onGoogleLogin])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    const trimmedPassword = password.trim()
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    if (!isValid) {
      setError('Enter a valid email address.')
      return
    }
    if (!trimmedPassword) {
      setError('Enter your password.')
      return
    }
    if (mode === 'signup') {
      if (trimmedPassword.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        setError('Passwords do not match.')
        return
      }
    }
    setError(null)
    setIsSubmitting(true)
    try {
      if (mode === 'signup') {
        await onSignup(trimmed, trimmedPassword)
      } else {
        await onLogin(trimmed, trimmedPassword)
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to sign in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-100 via-white to-primary-200 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          <img src={logo9021} alt="9021 logo" className="mx-auto mb-3 h-8 w-auto" />
          <p className="text-sm text-gray-500">
            {mode === 'signup' ? 'Create your account to continue' : 'Sign in to continue'}
          </p>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError(null)
            }}
            className={`rounded-md py-2 text-sm font-medium ${
              mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setError(null)
            }}
            className={`rounded-md py-2 text-sm font-medium ${
              mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Sign up
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isGoogleEnabled && (
            <div className="space-y-3">
              <div ref={googleButtonRef} className="flex justify-center" />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">or continue with email</span>
                </div>
              </div>
            </div>
          )}
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
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          )}
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
