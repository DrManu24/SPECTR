import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch, apiLogout, parseApiError, storeCsrfFromResponse } from '../api'
import Header from '../components/Header'
import { ORGANIZER_LABEL, ORGANIZER_LABEL_PLURAL } from '../labels'

const ORGANIZER_STATUS_LABELS = {
  active: { label: 'Active', cls: 'badge--active' },
  inactive: { label: 'Inactive', cls: 'badge--inactive' },
  disabled: { label: 'Disabled', cls: 'badge--disabled' },
}

function AdminHome() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)

  const [organizers, setOrganizers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [orgEmail, setOrgEmail] = useState('')
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    apiFetch('/admin/me')
      .then((res) => {
        if (!res.ok) { navigate('/admin/login', { replace: true }); return null }
        return res.json()
      })
      .then((data) => { if (data) { storeCsrfFromResponse(data); setAdmin(data); loadOrganizers() } })
      .catch(() => navigate('/admin/login', { replace: true }))
  }, [navigate])

  function loadOrganizers() {
    apiFetch('/admin/organizers/')
      .then((res) => res.ok ? res.json() : [])
      .then(setOrganizers)
      .catch(() => {})
  }

  async function handleLogout() {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      const ok = await apiLogout('/admin/logout')
      if (ok) {
        navigate('/admin/login', { replace: true })
      } else {
        setLogoutError('Logout failed. Please try again.')
      }
    } catch {
      setLogoutError('Could not connect to backend.')
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleInviteOrganizer(e) {
    e.preventDefault()
    setFormError(null)
    setSuccessMsg(null)
    setSubmitting(true)

    try {
      const res = await apiFetch('/admin/organizers/', {
        method: 'POST',
        json: { email: orgEmail },
      })
      const data = await res.json()

      if (!res.ok) {
        setFormError(parseApiError(data.detail) || `Failed to invite ${ORGANIZER_LABEL}.`)
        return
      }

      setSuccessMsg(
        `${ORGANIZER_LABEL} invited. Credentials sent to ${data.username}.`
      )
      setOrgEmail('')
      setShowForm(false)
      loadOrganizers()
    } catch {
      setFormError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  function cancelForm() {
    setShowForm(false)
    setFormError(null)
    setOrgEmail('')
  }

  return (
    <>
      <Header>
        {admin && (
          <button
            id="btn-logout"
            className="btn-secondary"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        )}
      </Header>


      <main className="app">
        <h1>Admin Dashboard</h1>

        {!admin ? (
          <p className="loading">Loading…</p>
        ) : (
          <>
            {logoutError && <p className="error">{logoutError}</p>}
            <div className="status-card" style={{ marginBottom: '28px' }}>
              <div className="label">Session</div>
              <p className="message">
                Logged in as <strong>{admin.username}</strong>
              </p>
            </div>

            <div className="section-header" style={{ marginBottom: '28px' }}>
              <h2 className="section-title">Audit trail</h2>
              <Link to="/admin/audit-logs" className="btn-secondary">
                View audit logs
              </Link>
            </div>

            <div className="section-header">
              <h2 className="section-title">{ORGANIZER_LABEL_PLURAL}</h2>
              {!showForm && (
                <button
                  id="btn-create-organizer"
                  className="btn-primary"
                  onClick={() => { setSuccessMsg(null); setShowForm(true) }}
                >
                  + Invite {ORGANIZER_LABEL}
                </button>
              )}
            </div>

            {successMsg && (
              <p className="success-msg">{successMsg}</p>
            )}

            {showForm && (
              <div className="setup-card" style={{ marginBottom: '20px' }}>
                <div className="setup-card__header">
                  <span className="setup-badge">New {ORGANIZER_LABEL}</span>
                  <h2>Invite {ORGANIZER_LABEL}</h2>
                  <p>
                    A temporary password will be generated and sent to the provided email address.
                    The CTC signs in using that email and password.
                  </p>
                </div>
                <form className="setup-form" onSubmit={handleInviteOrganizer} noValidate>
                  <div className="field">
                    <label htmlFor="org-email">Email</label>
                    <input
                      id="org-email"
                      type="email"
                      value={orgEmail}
                      onChange={(e) => setOrgEmail(e.target.value)}
                      placeholder="ctc@organization.org"
                      required
                      autoFocus
                    />
                  </div>
                  {formError && <p className="error">{formError}</p>}
                  <div className="form-actions">
                    <button id="btn-org-submit" type="submit" className="btn-primary" disabled={submitting}>
                      {submitting ? 'Sending invite…' : `Invite ${ORGANIZER_LABEL}`}
                    </button>
                    <button type="button" className="btn-secondary" onClick={cancelForm}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {organizers.length === 0 ? (
              <p className="empty-state">No {ORGANIZER_LABEL_PLURAL} yet. Invite one above.</p>
            ) : (
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Studies</th>
                    <th>Investigators</th>
                    <th>Records per study</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizers.map((org) => {
                    const status = ORGANIZER_STATUS_LABELS[org.status] || {
                      label: org.status,
                      cls: 'badge--inactive',
                    }
                    const canToggle = org.status === 'active' || org.status === 'disabled'

                    return (
                    <tr key={org.id}>
                      <td>{org.id}</td>
                      <td>{org.username}</td>
                      <td>
                        <span className={`badge ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>{org.study_count_limit ?? 0}</td>
                      <td>{org.investigator_count ?? 0}</td>
                      <td>{org.records_per_study_limit ?? 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <Link
                            to={`/admin/organizers/${org.id}`}
                            className="btn-primary"
                            style={{ textDecoration: 'none', fontSize: '12px', padding: '4px 10px' }}
                          >
                            View
                          </Link>
                          {canToggle ? (
                            <button
                              className={org.status === 'active' ? 'btn-danger' : 'btn-restore'}
                              disabled={togglingId === org.id}
                              onClick={async () => {
                                setTogglingId(org.id)
                                try {
                                  const res = await apiFetch(
                                    `/admin/organizers/${org.id}/status`,
                                    { method: 'PATCH' }
                                  )
                                  if (res.ok) {
                                    const updated = await res.json()
                                    setOrganizers((prev) =>
                                      prev.map((o) =>
                                        o.id === updated.id
                                          ? { ...o, ...updated }
                                          : o
                                      )
                                    )
                                  }
                                } finally {
                                  setTogglingId(null)
                                }
                              }}
                            >
                              {togglingId === org.id
                                ? '…'
                                : org.status === 'active' ? 'Disable' : 'Enable'}
                            </button>
                          ) : (
                            <span className="table-muted">Pending ToS</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}

export default AdminHome
