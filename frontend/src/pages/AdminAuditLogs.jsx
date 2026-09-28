import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api'
import Header from '../components/Header'
import { INVESTIGATOR_LABEL, ORGANIZER_LABEL, PARTICIPANT_LABEL } from '../labels'

const EVENT_TYPE_LABELS = {
  participant_kit_assigned: 'Kit assigned',
  emergency_unblinded: 'Emergency unblinded',
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function AdminAuditLogs() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [eventType, setEventType] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadLogs = useCallback(() => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })
    if (search) params.set('search', search)
    if (eventType) params.set('event_type', eventType)

    apiFetch(`/admin/audit-logs?${params}`)
      .then(async (res) => {
        if (res.status === 401) {
          navigate('/admin/login', { replace: true })
          return null
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail || 'Failed to load audit logs.')
        }
        return res.json()
      })
      .then((json) => {
        if (json) setData(json)
      })
      .catch((err) => setError(err.message || 'Failed to load audit logs.'))
      .finally(() => setLoading(false))
  }, [page, perPage, search, eventType, navigate])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  function handleSearchSubmit(e) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function handlePerPageChange(e) {
    setPage(1)
    setPerPage(Number(e.target.value))
  }

  function handleEventTypeChange(e) {
    setPage(1)
    setEventType(e.target.value)
  }

  const showingFrom = data ? (data.page - 1) * data.per_page + 1 : 0
  const showingTo = data ? Math.min(data.page * data.per_page, data.total_count) : 0

  return (
    <>
      <Header />

      <main className="app">
        <div className="section-header">
          <div>
            <p style={{ margin: '0 0 8px' }}>
              <Link to="/admin/home" className="nav-link" style={{ display: 'inline' }}>
                ← Back to dashboard
              </Link>
            </p>
            <h1 style={{ margin: 0 }}>Audit Logs</h1>
            <p style={{ margin: '8px 0 0', color: '#555', fontSize: '14px' }}>
              Immutable trial events (kit assignments and emergency unblinding).
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'flex-end',
            marginBottom: '16px',
          }}
        >
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 280px' }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="audit-search">Search</label>
              <input
                id="audit-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`${PARTICIPANT_LABEL} ID, protocol, kit, investigator, reason`}
              />
            </div>
            <button type="submit" className="btn-secondary" style={{ alignSelf: 'flex-end' }}>
              Search
            </button>
          </form>

          <div className="field" style={{ margin: 0, minWidth: '180px' }}>
            <label htmlFor="audit-event-type">Event type</label>
            <select
              id="audit-event-type"
              value={eventType}
              onChange={handleEventTypeChange}
              className="select-input"
            >
              <option value="">All events</option>
              <option value="participant_kit_assigned">Kit assigned</option>
              <option value="emergency_unblinded">Emergency unblinded</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0, minWidth: '140px' }}>
            <label htmlFor="audit-per-page">Per page</label>
            <select
              id="audit-per-page"
              value={perPage}
              onChange={handlePerPageChange}
              className="select-input"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="loading">Loading audit logs…</p>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Protocol</th>
                    <th>{PARTICIPANT_LABEL}</th>
                    <th>Kit</th>
                    <th>Site</th>
                    <th>{INVESTIGATOR_LABEL}</th>
                    <th>{ORGANIZER_LABEL}</th>
                    <th>Reason</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#555' }}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td>
                        <span className="badge badge--active">
                          {EVENT_TYPE_LABELS[log.event_type] || log.event_type}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{log.protocol_code}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{log.study_title}</div>
                      </td>
                      <td>{log.participant_id || '—'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{log.kit_code}</td>
                      <td>{log.site_name || '—'}</td>
                      <td>{log.site_investigator_username || '—'}</td>
                      <td>{log.ctc_username || '—'}</td>
                      <td style={{ maxWidth: '240px', whiteSpace: 'pre-wrap', color: '#444' }}>
                        {log.unblind_reason || '—'}
                      </td>
                      <td style={{ color: '#666' }}>{log.client_ip || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#555' }}>
                Showing <strong>{showingFrom}</strong>–<strong>{showingTo}</strong> of{' '}
                <strong>{data.total_count}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                >
                  Previous
                </button>
                <span style={{ fontSize: '13px', color: '#333', fontWeight: 600 }}>
                  Page {data.page} of {data.total_pages}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={data.page >= data.total_pages || loading}
                  onClick={() => setPage((p) => Math.min(p + 1, data.total_pages))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="empty-state">No audit logs match your filters.</p>
        )}
      </main>
    </>
  )
}

export default AdminAuditLogs
