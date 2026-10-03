import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, parseApiError, setCsrfToken } from '../api'
import PasswordInput from '../components/PasswordInput'
import Header from '../components/Header'

function AdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/admin/login', {
        method: 'POST',
        json: { username, password },
      })
      const data = await res.json()

      if (!res.ok) {
        setError(parseApiError(data.detail) || 'Login failed.')
        return
      }

      setCsrfToken(data.csrf_token)
      navigate('/admin/home', { replace: true })
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Header />


      <main className="app">
        <h1>Admin Login</h1>

        <div className="setup-card">
          <div className="setup-card__header">
            <span className="setup-badge">Admin Area</span>
            <h2>Sign In</h2>
            <p>Enter your admin credentials to continue.</p>
          </div>

          <form className="setup-form" onSubmit={handleLogin} noValidate>
            <div className="field">
              <label htmlFor="admin-username">Username</label>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <PasswordInput
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && <p className="error">{error}</p>}

            <button
              id="btn-admin-login"
              type="submit"
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </main>
    </>
  )
}

export default AdminLogin
