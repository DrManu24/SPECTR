import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { apiFetch, apiUpload, parseApiError, storeCsrfFromResponse } from '../api'
import Header from '../components/Header'
import { INVESTIGATOR_LABEL, INVESTIGATOR_LABEL_PLURAL } from '../labels'

const MAX_CSV_ROWS = 10

const STATUS_LABELS = {
  inactive: { label: 'Inactive', cls: 'badge--inactive' },
  active:   { label: 'Active',   cls: 'badge--active'   },
  revoked:  { label: 'Revoked',  cls: 'badge--inactive' },
}

function StudyInvestigators() {
  const { studyId, siteId } = useParams()
  const navigate = useNavigate()
  const [study, setStudy] = useState(null)
  const [site, setSite] = useState(null)
  const [investigators, setInvestigators] = useState([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [csvError, setCsvError] = useState(null)
  const [csvResult, setCsvResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [csvUploading, setCsvUploading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null) // id of investigator being updated
  const [pendingAction, setPendingAction] = useState(null) // { type, id, label }

  function loadInvestigators() {
    apiFetch(`/organizer/studies/${studyId}/sites/${siteId}/investigators`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setInvestigators)
      .catch(() => {})
  }

  useEffect(() => {
    apiFetch('/organizer/me')
      .then(async (res) => {
        if (!res.ok) {
          navigate('/organizer/login', { replace: true })
          return null
        }
        const me = await res.json()
        storeCsrfFromResponse(me)
        return Promise.all([
          apiFetch(`/organizer/studies/${studyId}`),
          apiFetch(`/organizer/studies/${studyId}/sites`),
          apiFetch(`/organizer/studies/${studyId}/sites/${siteId}/investigators`),
        ])
      })
      .then((result) => {
        if (!result) return
        const [studyRes, sitesRes, invRes] = result
        if (!studyRes.ok) {
          navigate('/organizer/home', { replace: true })
          return
        }
        return Promise.all([
          studyRes.json(),
          sitesRes.ok ? sitesRes.json() : [],
          invRes.ok ? invRes.json() : [],
        ])
      })
      .then((data) => {
        if (!data) return
        const [studyData, sitesData, invData] = data
        setStudy(studyData)
        setSite(sitesData.find((s) => String(s.id) === String(siteId)) || null)
        setInvestigators(invData)
      })
      .catch(() => navigate('/organizer/login', { replace: true }))
  }, [navigate, studyId, siteId])

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please select a .csv file.')
      e.target.value = ''
      return
    }

    const text = await file.text()
    const rowCount = text
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim()).length

    if (rowCount > MAX_CSV_ROWS) {
      setCsvError(`CSV size limit is ${MAX_CSV_ROWS} rows.`)
      e.target.value = ''
      return
    }

    setCsvError(null)
    setCsvResult(null)
    setCsvUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await apiUpload(
        `/organizer/studies/${studyId}/sites/${siteId}/investigators/bulk`,
        formData
      )
      const data = await res.json()

      if (!res.ok) {
        setCsvError(parseApiError(data.detail) || 'Failed to process CSV.')
        return
      }

      setCsvResult(data)
      loadInvestigators()
    } catch {
      setCsvError('Could not connect to backend.')
    } finally {
      setCsvUploading(false)
      e.target.value = ''
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setSubmitting(true)

    try {
      const res = await apiFetch(`/organizer/studies/${studyId}/sites/${siteId}/investigators`, {
        method: 'POST',
        json: { email: email.trim(), name: name.trim() || null },
      })
      const data = await res.json()

      if (!res.ok) {
        setError(parseApiError(data.detail) || `Failed to add ${INVESTIGATOR_LABEL.toLowerCase()}.`)
        return
      }

      setSuccessMsg(
        `${INVESTIGATOR_LABEL} added (username: ${data.username}). Credentials sent to ${data.email}.`
      )
      setEmail('')
      setName('')
      loadInvestigators()
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(investigatorId) {
    setActionLoading(investigatorId)
    try {
      const res = await apiFetch(
        `/organizer/studies/${studyId}/sites/${siteId}/investigators/${investigatorId}/revoke`,
        { method: 'PATCH' }
      )
      if (!res.ok) {
        const data = await res.json()
        alert(parseApiError(data.detail) || 'Failed to revoke access.')
        return
      }
      setPendingAction(null)
      loadInvestigators()
    } catch {
      alert('Could not connect to backend.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRestore(investigatorId) {
    setActionLoading(investigatorId)
    try {
      const res = await apiFetch(
        `/organizer/studies/${studyId}/sites/${siteId}/investigators/${investigatorId}/restore`,
        { method: 'PATCH' }
      )
      if (!res.ok) {
        const data = await res.json()
        alert(parseApiError(data.detail) || 'Failed to restore access.')
        return
      }
      setPendingAction(null)
      setSuccessMsg(`${INVESTIGATOR_LABEL} access restored. They can log in again with their existing credentials.`)
      loadInvestigators()
    } catch {
      alert('Could not connect to backend.')
    } finally {
      setActionLoading(null)
    }
  }

  function investigatorLabel(inv) {
    return inv.name || inv.username
  }

  return (
    <>
      <Header />

      <main className="app">
        <div className="page-header">
          <Link to={`/organizer/studies/${studyId}/home`} className="back-link">
            ← Back to Study
          </Link>
          <h1>{INVESTIGATOR_LABEL_PLURAL} — {site ? site.name : 'Site'}</h1>
        </div>

        {!study ? (
          <p className="loading">Loading study…</p>
        ) : (
          <>
            <div className="status-card" style={{ marginBottom: '24px' }}>
              <div className="label">Study</div>
              <p className="message">
                <strong>{study.protocol_code}</strong> — {study.title}
              </p>
              {site && (
                <p className="message" style={{ marginTop: '8px' }}>
                  <strong>Site:</strong> {site.name}
                </p>
              )}
            </div>

            {/* Invite panels */}
            <div className="invite-panels">
              <div className="setup-card">
                <div className="setup-card__header">
                  <span className="setup-badge">Single Invite</span>
                  <h2>Add site {INVESTIGATOR_LABEL.toLowerCase()}</h2>
                  <p>
                    The system will generate a unique username and temporary password and send them
                    to the provided email address. This investigator will be linked to{' '}
                    <strong>{site?.name || 'this site'}</strong>.
                  </p>
                </div>

                <form className="setup-form" onSubmit={handleInvite} noValidate>
                  <div className="field">
                    <label htmlFor="inv-email">Email *</label>
                    <input
                      id="inv-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="site.investigator@hospital.org"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="inv-name">Full name (optional)</label>
                    <input
                      id="inv-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Dr. Jane Smith"
                    />
                  </div>
                  {error && <p className="error">{error}</p>}
                  {successMsg && <p className="success-msg">{successMsg}</p>}
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Adding…' : `Add Site ${INVESTIGATOR_LABEL}`}
                  </button>
                </form>
              </div>

              <div className="setup-card">
                <div className="setup-card__header">
                  <span className="setup-badge">Bulk Invite</span>
                  <h2>Upload CSV</h2>
                  <p>
                    Invite many {INVESTIGATOR_LABEL_PLURAL.toLowerCase()} at once. Each row is processed and credentials
                    are emailed automatically.
                  </p>
                </div>

                <div className="setup-form csv-upload-area">
                  <ul className="csv-instructions">
                    <li>CSV must have exactly <strong>2 columns</strong>: email, then name.</li>
                    <li>Do <strong>not</strong> include a header row — data only.</li>
                    <li>Name is optional and may be left empty; email is required on every row.</li>
                    <li>CSV size limit: <strong>{MAX_CSV_ROWS} rows</strong>.</li>
                    <li>Maximum file size: <strong>1 MB</strong>.</li>
                  </ul>

                  <a
                    className="csv-sample-link"
                    href="/samples/investigator-invite-sample.csv"
                    download="investigator-invite-sample.csv"
                  >
                    Download sample CSV
                  </a>

                  <div className="field">
                    <label htmlFor="inv-csv">Select CSV file</label>
                    <input
                      id="inv-csv"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={csvUploading}
                      onChange={handleCsvUpload}
                    />
                  </div>

                  {csvUploading && <p className="loading">Uploading and sending invitations…</p>}
                  {csvError && <p className="error">{csvError}</p>}

                  {csvResult && (
                    <div>
                      <p className="success-msg">
                        {csvResult.created_count} invited, {csvResult.skipped_count} skipped,{' '}
                        {csvResult.failed_count} failed.
                      </p>
                      {csvResult.results?.length > 0 && (
                        <ul className="bulk-results">
                          {csvResult.results.map((row) => (
                            <li
                              key={`${row.row}-${row.email}`}
                              className={`bulk-results__${row.status}`}
                            >
                              Row {row.row} ({row.email})
                              {row.username ? ` → ${row.username}` : ''}
                              {row.message ? ` — ${row.message}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Investigators table */}
            <div className="section-header" style={{ marginTop: '32px' }}>
              <h2 className="section-title">{INVESTIGATOR_LABEL_PLURAL}</h2>
            </div>

            {investigators.length === 0 ? (
              <div className="empty-state">
                <p>No {INVESTIGATOR_LABEL_PLURAL.toLowerCase()} added yet.</p>
              </div>
            ) : (
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {investigators.map((inv) => {
                    const badge = STATUS_LABELS[inv.status] || { label: inv.status, cls: 'badge--inactive' }
                    return (
                      <tr key={inv.id}>
                        <td><code>{inv.username}</code></td>
                        <td>{inv.name || '—'}</td>
                        <td>{inv.email}</td>
                        <td>
                          <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                        <td>
                          {pendingAction?.id === inv.id ? (
                            <div className="action-confirm">
                              <p className="action-confirm__text">
                                {pendingAction.type === 'revoke'
                                  ? `Revoke access for ${pendingAction.label}? They will no longer be able to log in.`
                                  : `Restore access for ${pendingAction.label}? They can log in again with their existing credentials.`}
                              </p>
                              <div className="action-confirm__buttons">
                                <button
                                  type="button"
                                  className={pendingAction.type === 'revoke' ? 'btn-danger' : 'btn-primary'}
                                  style={{ fontSize: '12px', padding: '4px 10px' }}
                                  disabled={actionLoading === inv.id}
                                  onClick={() =>
                                    pendingAction.type === 'revoke'
                                      ? handleRevoke(inv.id)
                                      : handleRestore(inv.id)
                                  }
                                >
                                  {actionLoading === inv.id
                                    ? 'Saving…'
                                    : pendingAction.type === 'revoke'
                                    ? 'Yes, revoke'
                                    : 'Yes, restore'}
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ fontSize: '12px', padding: '4px 10px' }}
                                  disabled={actionLoading === inv.id}
                                  onClick={() => setPendingAction(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : inv.status === 'revoked' ? (
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              disabled={actionLoading === inv.id}
                              onClick={() =>
                                setPendingAction({
                                  type: 'restore',
                                  id: inv.id,
                                  label: investigatorLabel(inv),
                                })
                              }
                            >
                              Restore access
                            </button>
                          ) : (
                            <button
                              className="btn-secondary"
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              disabled={actionLoading === inv.id}
                              onClick={() =>
                                setPendingAction({
                                  type: 'revoke',
                                  id: inv.id,
                                  label: investigatorLabel(inv),
                                })
                              }
                            >
                              Revoke
                            </button>
                          )}
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

export default StudyInvestigators
