import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch, bootstrapCsrf, parseApiError, setCsrfToken, storeCsrfFromResponse } from '../api'
import PasswordInput from '../components/PasswordInput'
import Header from '../components/Header'
import { INVESTIGATOR_LABEL, ORGANIZER_LABEL } from '../labels'

function InvestigatorLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('session') === 'expired'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotUsername, setForgotUsername] = useState('')
  const [forgotError, setForgotError] = useState(null)
  const [forgotSuccess, setForgotSuccess] = useState(null)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)

  useEffect(() => {
    bootstrapCsrf()
    // If already authenticated, redirect to home (skip check if session explicitly expired)
    if (sessionExpired) {
      setCheckingSession(false)
      return
    }
    apiFetch('/investigator/me')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          storeCsrfFromResponse(data)
          navigate('/investigator/home', { replace: true })
        } else {
          setCheckingSession(false)
        }
      })
      .catch(() => setCheckingSession(false))
  }, [navigate, sessionExpired])

  function openForgotPassword() {
    setForgotError(null)
    setForgotSuccess(null)
    if (username) {
      setForgotUsername(username)
    }
    setShowForgotPassword(true)
  }

  function openSignIn() {
    setForgotError(null)
    setForgotSuccess(null)
    setShowForgotPassword(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/investigator/login', {
        method: 'POST',
        json: {
          username: username.trim(),
          password,
          remember_me: rememberMe,
        },
      })
      let data = {}
      try {
        data = await res.json()
      } catch {
        if (!res.ok) {
          setError('Login failed. Please try again.')
          return
        }
      }

      if (!res.ok) {
        setError(parseApiError(data.detail) || 'Login failed.')
        return
      }

      setCsrfToken(data.csrf_token)
      navigate('/investigator/home', { replace: true })
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotError(null)
    setForgotSuccess(null)
    setForgotSubmitting(true)

    try {
      const res = await apiFetch('/investigator/forgot-password', {
        method: 'POST',
        json: { username: forgotUsername.trim() },
      })
      let data = {}
      try {
        data = await res.json()
      } catch {
        if (!res.ok) {
          setForgotError('Could not send a new password. Please try again.')
          return
        }
      }

      if (!res.ok) {
        setForgotError(parseApiError(data.detail) || 'Could not send a new password.')
        return
      }

      setForgotSuccess(data.message)
      setForgotUsername('')
    } catch (err) {
      if (err?.name === 'CsrfError') {
        setForgotError(err.message)
      } else {
        setForgotError('Could not connect to backend.')
      }
    } finally {
      setForgotSubmitting(false)
    }
  }

  if (checkingSession) {
    return (
      <>
        <Header />
        <main className="app">
          <p className="loading">Verifying session…</p>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />

      <main className="app">
        <h1>{INVESTIGATOR_LABEL} Login</h1>

        {!showForgotPassword ? (
          <div className="setup-card">
            <div className="setup-card__header">
              <span className="setup-badge">{INVESTIGATOR_LABEL} Portal</span>
              <h2>Sign In</h2>
              <p>Enter your username and password to continue.</p>
            </div>

            <form className="setup-form" onSubmit={handleLogin} noValidate>
              {sessionExpired && (
                <p className="error" role="status">
                  Your session expired. Please sign in again.
                </p>
              )}
              <div className="field">
                <label htmlFor="inv-login-username">Username</label>
                <input
                  id="inv-login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. K7M2P9"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <label htmlFor="inv-login-password">Password</label>
                <PasswordInput
                  id="inv-login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="field field-checkbox">
                <label htmlFor="inv-remember-me" className="checkbox-label">
                  <input
                    id="inv-remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Keep me signed in for 30 days
                </label>
              </div>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>

              <p style={{ marginTop: '12px' }}>
                <button type="button" className="auth-link" onClick={openForgotPassword}>
                  Forgot password?
                </button>
              </p>
            </form>
          </div>
        ) : (
          <div className="setup-card">
            <div className="setup-card__header">
              <span className="setup-badge">Password Reset</span>
              <h2>Forgot Password</h2>
              <p>
                Enter your username and we will send a new temporary password to the email
                address on file for that account.
              </p>
            </div>

            <form className="setup-form" onSubmit={handleForgotPassword} noValidate>
              <div className="field">
                <label htmlFor="inv-forgot-username">Username</label>
                <input
                  id="inv-forgot-username"
                  type="text"
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder="e.g. K7M2P9"
                  required
                  autoFocus
                />
              </div>

              <p className="message" style={{ marginTop: 0 }}>
                If you also forgot your username, contact your {ORGANIZER_LABEL} (Central Trial
                Coordinator).
              </p>

              {forgotError && <p className="error">{forgotError}</p>}
              {forgotSuccess && <p className="success-msg">{forgotSuccess}</p>}

              <button
                type="submit"
                className="btn-primary"
                disabled={forgotSubmitting}
              >
                {forgotSubmitting ? 'Sending…' : 'Send New Password'}
              </button>

              <p style={{ marginTop: '12px' }}>
                <button type="button" className="auth-link" onClick={openSignIn}>
                  Sign in
                </button>
              </p>
            </form>
          </div>
        )}
      </main>
    </>
  )
}

export default InvestigatorLogin
