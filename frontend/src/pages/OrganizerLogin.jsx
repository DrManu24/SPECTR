import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, bootstrapCsrf, parseApiError, setCsrfToken } from '../api'
import PasswordInput from '../components/PasswordInput'
import Header from '../components/Header'
import TermsOfServiceModal from '../components/TermsOfServiceModal'
import { ORGANIZER_LABEL } from '../labels'

function OrganizerLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotError, setForgotError] = useState(null)
  const [forgotSuccess, setForgotSuccess] = useState(null)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)

  useEffect(() => {
    bootstrapCsrf()
  }, [])

  function openForgotPassword() {
    setForgotError(null)
    setForgotSuccess(null)
    if (username) {
      setForgotEmail(username)
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
      const res = await apiFetch('/organizer/login', {
        method: 'POST',
        json: { username, password, remember_me: rememberMe },
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

      if (
        res.status === 403 &&
        typeof data.detail === 'string' &&
        data.detail.includes('Terms of service')
      ) {
        setShowTerms(true)
        setTermsAccepted(false)
        setError(null)
        return
      }

      if (!res.ok) {
        setError(parseApiError(data.detail) || 'Login failed.')
        return
      }

      setCsrfToken(data.csrf_token)
      navigate('/organizer/home', { replace: true })
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAcceptTerms() {
    if (!termsAccepted) {
      setError('You must accept the terms of service to continue.')
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/organizer/accept-terms', {
        method: 'POST',
        json: { username, password, remember_me: rememberMe },
      })
      let data = {}
      try {
        data = await res.json()
      } catch {
        if (!res.ok) {
          setError('Could not accept terms. Please try again.')
          return
        }
      }

      if (!res.ok) {
        setError(parseApiError(data.detail) || 'Could not accept terms.')
        return
      }

      setCsrfToken(data.csrf_token)
      navigate('/organizer/home', { replace: true })
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
      const res = await apiFetch('/organizer/forgot-password', {
        method: 'POST',
        json: { email: forgotEmail },
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
      setForgotEmail('')
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

  return (
    <>
      <Header />

      <main className="app">
        <h1>{ORGANIZER_LABEL} Portal</h1>

        {!showForgotPassword ? (
          <div className="setup-card">
            <div className="setup-card__header">
              <span className="setup-badge">{ORGANIZER_LABEL} Area</span>
              <h2>{ORGANIZER_LABEL} Sign In</h2>
              <p>Enter your {ORGANIZER_LABEL} credentials to log in to the randomizer.</p>
            </div>

            <form className="setup-form" onSubmit={handleLogin} noValidate>
              <div className="field">
                <label htmlFor="org-username">Email</label>
                <input
                  id="org-username"
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ctc@organization.org"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="org-password">Password</label>
                <PasswordInput
                  id="org-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="field field-checkbox">
                <label htmlFor="org-remember-me" className="checkbox-label">
                  <input
                    id="org-remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Keep me signed in for 30 days
                </label>
              </div>

              {error && <p className="error">{error}</p>}

              <button
                id="btn-org-login"
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Authenticating…' : 'Sign In'}
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
                Enter your email address and we will send you a new temporary password.
              </p>
            </div>

            <form className="setup-form" onSubmit={handleForgotPassword} noValidate>
              <div className="field">
                <label htmlFor="org-forgot-email">Email</label>
                <input
                  id="org-forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="ctc@organization.org"
                  required
                  autoFocus
                />
              </div>

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

      {showTerms && (
        <TermsOfServiceModal
          termsAccepted={termsAccepted}
          onTermsAcceptedChange={setTermsAccepted}
          accepting={submitting}
          error={error}
          onAccept={handleAcceptTerms}
          onDecline={() => {
            setShowTerms(false)
            setTermsAccepted(false)
            setError(null)
          }}
        />
      )}
    </>
  )
}

export default OrganizerLogin
