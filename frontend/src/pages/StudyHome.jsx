import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { apiFetch, parseApiError } from '../api'
import Header from '../components/Header'
import { ORGANIZER_LABEL, INVESTIGATOR_LABEL, PARTICIPANT_LABEL, PARTICIPANT_LABEL_PLURAL } from '../labels'
import { BLINDING_TYPE, blindingTypeLabel } from '../utils/blindingType'
import { downloadCsv, rowsToCsv } from '../utils/csv'
import { buildMaskedArmMap, maskTreatmentArm } from '../utils/treatmentArmMasking'

const TABLE_ACTION_BTN_STYLE = {
  fontSize: '13px',
  padding: '6px 14px',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '132px',
  boxSizing: 'border-box',
  lineHeight: 1.2,
}

const HEADER_ACTION_BTN_STYLE = {
  fontSize: '12px',
  padding: '4px 10px',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '76px',
  boxSizing: 'border-box',
  lineHeight: 1.2,
}

function StudyHome() {
  const { studyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [study, setStudy] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [allocationEmailSaving, setAllocationEmailSaving] = useState(false)
  const [allocationEmailError, setAllocationEmailError] = useState(null)
  const successMsg = location.state?.successMsg || null

  const canDeleteStudy = study && ['Draft', 'Generated'].includes(study.status)

  // Pagination & Filter state for Active Study Randomized Records
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // '' | 'assigned' | 'unassigned' | 'blinded' | 'unblinded'
  const [siteFilter, setSiteFilter] = useState('')
  const [strataFilter, setStrataFilter] = useState('')
  const [recordsData, setRecordsData] = useState(null)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [sitesData, setSitesData] = useState([])
  const [stratasData, setStratasData] = useState([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [exportingRecords, setExportingRecords] = useState(false)

  // Fetch Study details
  useEffect(() => {
    apiFetch(`/organizer/studies/${studyId}`)
      .then((res) => {
        if (!res.ok) {
          navigate('/organizer/home', { replace: true })
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) setStudy(data)
      })
      .catch(() => navigate('/organizer/home', { replace: true }))
  }, [studyId, navigate])

  const hasRandomizationView = study && ['Generated', 'Active', 'Complete'].includes(study.status)

  // Fetch Randomized Sequence Records once randomization exists
  useEffect(() => {
    if (!hasRandomizationView) return

    setLoadingRecords(true)
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    })
    if (search.trim()) params.append('search', search.trim())
    if (statusFilter) params.append('status_filter', statusFilter)
    if (siteFilter) params.append('site_id', siteFilter)
    if (strataFilter) params.append('strata_name', strataFilter)

    apiFetch(`/organizer/studies/${studyId}/randomization-records?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRecordsData(data)
      })
      .catch(() => {})
      .finally(() => setLoadingRecords(false))
  }, [studyId, hasRandomizationView, page, perPage, search, statusFilter, siteFilter, strataFilter])

  useEffect(() => {
    if (!hasRandomizationView) return

    setLoadingSites(true)
    apiFetch(`/organizer/studies/${studyId}/sites`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (Array.isArray(data)) setSitesData(data) })
      .catch(() => setSitesData([]))
      .finally(() => setLoadingSites(false))
  }, [studyId, hasRandomizationView])

  useEffect(() => {
    if (!hasRandomizationView) return

    const params = new URLSearchParams()
    if (siteFilter) params.append('site_id', siteFilter)

    apiFetch(`/organizer/studies/${studyId}/stratas?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setStratasData(data)
        else setStratasData([])
      })
      .catch(() => setStratasData([]))
  }, [studyId, hasRandomizationView, siteFilter])

  useEffect(() => {
    if (strataFilter && !stratasData.some((strata) => strata.name === strataFilter)) {
      setStrataFilter('')
    }
  }, [siteFilter, stratasData, strataFilter])

  // Reset page to 1 when search or statusFilter changes
  function handleSearchChange(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  function handleFilterChange(e) {
    setStatusFilter(e.target.value)
    setPage(1)
  }

  function handleSiteFilterChange(e) {
    setSiteFilter(e.target.value)
    setPage(1)
  }

  function handleStrataFilterChange(e) {
    setStrataFilter(e.target.value)
    setPage(1)
  }

  function handlePerPageChange(e) {
    setPerPage(parseInt(e.target.value, 10))
    setPage(1)
  }

  async function fetchAllRandomizationRecords() {
    const allRecords = []
    let currentPage = 1
    let totalPages = 1

    do {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '100',
      })
      const res = await apiFetch(`/organizer/studies/${studyId}/randomization-records?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to fetch randomization records.')
      }
      const data = await res.json()
      allRecords.push(...(data.records || []))
      totalPages = data.total_pages || 1
      currentPage += 1
    } while (currentPage <= totalPages)

    return allRecords
  }

  async function handleEmailAllocationChange(checked) {
    if (!study) return
    setAllocationEmailSaving(true)
    setAllocationEmailError(null)
    const previous = study.email_allocation
    setStudy((current) => ({ ...current, email_allocation: checked }))
    try {
      const res = await apiFetch(`/organizer/studies/${studyId}`, {
        method: 'PATCH',
        json: { email_allocation: checked },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStudy((current) => ({ ...current, email_allocation: previous }))
        setAllocationEmailError(
          parseApiError(data.detail) || 'Could not update allocation alert setting.'
        )
        return
      }
      const data = await res.json()
      setStudy(data)
    } catch {
      setStudy((current) => ({ ...current, email_allocation: previous }))
      setAllocationEmailError('Could not update allocation alert setting.')
    } finally {
      setAllocationEmailSaving(false)
    }
  }

  async function handleDeleteStudy() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await apiFetch(`/organizer/studies/${studyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(parseApiError(data.detail) || 'Failed to delete study.')
        return
      }
      navigate('/organizer/home', {
        replace: true,
        state: { successMsg: `Study "${study.protocol_code}" was deleted.` },
      })
    } catch {
      setDeleteError('Failed to delete study.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleExportRecords() {
    setExportingRecords(true)
    try {
      const records = await fetchAllRandomizationRecords()
      const maskTreatmentArms = study?.blinding_type === BLINDING_TYPE.PISB
      const armMaskMap = maskTreatmentArms
        ? buildMaskedArmMap(
            records.map((rec) => rec.treatment_name),
            (study?.treatment_arms || []).map((arm) => arm.name),
          )
        : null
      const headers = [
        'Seq #',
        'Kit Code',
        'Site',
        'Strata',
        'Intervention Arm',
        'Blind Status',
        `${PARTICIPANT_LABEL} ID`,
        `${INVESTIGATOR_LABEL} ID`,
        `${INVESTIGATOR_LABEL} Name`,
        `${INVESTIGATOR_LABEL} Email`,
        'Assigned Date',
        'Unblinded At',
        'Unblind Reason',
      ]

      const rows = records.map((rec) => [
        rec.sequence_number,
        rec.kit_code || '',
        rec.site_name || '',
        rec.strata_name || '',
        maskTreatmentArms
          ? maskTreatmentArm(rec.treatment_name, armMaskMap)
          : (rec.treatment_name || ''),
        rec.blind ? 'Blinded' : 'Unblinded',
        rec.assigned_patient_id || '',
        rec.assigned_by_investigator_username
          || (rec.assigned_by_investigator_id ? `ID #${rec.assigned_by_investigator_id}` : ''),
        rec.assigned_by_investigator_id ? (rec.assigned_by_investigator_name || '') : '',
        rec.assigned_by_investigator_id ? (rec.assigned_by_investigator_email || '') : '',
        rec.assigned_at ? new Date(rec.assigned_at).toISOString() : '',
        rec.unblinded_at ? new Date(rec.unblinded_at).toISOString() : '',
        rec.unblind_reason || '',
      ])

      const protocolSlug = study?.protocol_code
        ? study.protocol_code.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
        : `study-${studyId}`
      downloadCsv(`${protocolSlug}-randomized-sequence-records.csv`, rowsToCsv(headers, rows))
    } catch {
      // Export failed silently; user can retry.
    } finally {
      setExportingRecords(false)
    }
  }

  return (
    <>
      <Header />
      <main className="app">
        <div className="page-header">
          <Link to="/organizer/home" className="back-link">
            ← Back to Studies
          </Link>
          <h1>{study ? study.title : 'Loading…'}</h1>
        </div>

        {successMsg && <p className="success-msg">{successMsg}</p>}
        {deleteError && <p className="error">{deleteError}</p>}

        {study && (
          <>
            {/* Study meta status bar */}
            <div className="status-card" style={{ marginBottom: '24px', maxWidth: 'none' }}>
              <div className="label">Protocol Overview</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <p className="message" style={{ margin: 0 }}>
                  <strong>{study.protocol_code}</strong>
                  {' · '}
                  <span className={`badge badge--${study.status === 'Draft' ? 'inactive' : 'active'}`}>
                    {study.status}
                  </span>
                  {' · '}
                  <span>{blindingTypeLabel(study.blinding_type)}</span>
                  {study.status === 'Active' && (
                    <span style={{ marginLeft: '12px', fontSize: '13px', color: '#555', fontWeight: 600 }}>
                      [Setup Locked]
                    </span>
                  )}
                  {study.status === 'Generated' && (
                    <span style={{ marginLeft: '12px', fontSize: '13px', color: '#555', fontWeight: 600 }}>
                      [Randomization Generated]
                    </span>
                  )}
                  {study.status === 'Complete' && (
                    <span style={{ marginLeft: '12px', fontSize: '13px', color: '#555', fontWeight: 600 }}>
                      [Study Complete]
                    </span>
                  )}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {study.status === 'Draft' && (
                    <span style={{ fontSize: '13px', color: '#555', fontStyle: 'italic' }}>
                      Draft Mode — Complete setup to generate randomization
                    </span>
                  )}
                  {study.status === 'Generated' && (
                    <span style={{ fontSize: '13px', color: '#555', fontStyle: 'italic' }}>
                      Randomization sequence loaded — review records below or re-upload CSV to replace
                    </span>
                  )}
                  {study.status === 'Complete' && (
                    <span style={{ fontSize: '13px', color: '#555', fontStyle: 'italic' }}>
                      All sequence records have been assigned — study is complete
                    </span>
                  )}
                  <Link
                    to={`/organizer/studies/${studyId}/edit`}
                    className="btn-secondary"
                    style={{ ...HEADER_ACTION_BTN_STYLE, textDecoration: 'none' }}
                  >
                    Edit
                  </Link>
                  {canDeleteStudy && !confirmDelete && (
                    <button
                      type="button"
                      className="btn-danger"
                      style={HEADER_ACTION_BTN_STYLE}
                      disabled={deleting}
                      onClick={() => {
                        setDeleteError(null)
                        setConfirmDelete(true)
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {canDeleteStudy && confirmDelete && (
                    <div className="action-confirm" style={{ margin: 0 }}>
                      <p className="action-confirm__text" style={{ margin: 0 }}>
                        Permanently delete <strong>{study.title}</strong> ({study.protocol_code}) and all related data?
                        This cannot be undone.
                      </p>
                      <div className="action-confirm__buttons">
                        <button
                          type="button"
                          className="btn-danger"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          disabled={deleting}
                          onClick={handleDeleteStudy}
                        >
                          {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          disabled={deleting}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="field-checkbox" style={{ marginTop: '12px' }}>
                <label htmlFor="email-allocation-alert" className="checkbox-label" style={{ fontWeight: 500, fontSize: '13px' }}>
                  <input
                    id="email-allocation-alert"
                    type="checkbox"
                    checked={Boolean(study.email_allocation)}
                    disabled={allocationEmailSaving}
                    onChange={(e) => handleEmailAllocationChange(e.target.checked)}
                  />
                  Email me when a participant is allocated
                </label>
                {allocationEmailError && (
                  <span className="field-hint" style={{ color: '#b00020' }}>{allocationEmailError}</span>
                )}
              </div>
            </div>

            {/* IF STUDY IS DRAFT: SHOW STUDY SETUP */}
            {study.status === 'Draft' ? (
              <>
                <div className="section-header">
                  <h2 className="section-title">Study Setup</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginTop: '16px', maxWidth: '400px' }}>
                  {/* Upload CSV — Arms and Randomization hidden for now */}
                  <div className="study-form-card" style={{ maxWidth: 'none' }}>
                    <div className="setup-card__header">
                      <span className="setup-badge">Data</span>
                      <h2 style={{ marginTop: '8px', fontSize: '15px' }}>Upload CSV</h2>
                      <p style={{ marginTop: '4px' }}>
                        Import a pre-randomized sequence from a CSV file.
                      </p>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      <Link
                        id="btn-study-upload"
                        to={`/organizer/studies/${studyId}/upload-csv`}
                        className="btn-primary"
                        style={{ textDecoration: 'none' }}
                      >
                        Upload CSV
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* IF STUDY IS ACTIVE: SHOW RANDOMIZED SEQUENCE RECORDS DATA TABLE */
              <>
                {/* Stats Summary Cards */}
                {recordsData && (
                  <div className={`stats-grid${recordsData.unblinded_count > 0 ? ' stats-grid--cols-4' : ''}`}>
                    <div className="status-card" style={{ maxWidth: 'none', margin: 0 }}>
                      <div className="label">Total Sequence Records</div>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#1a1a2e', marginTop: '4px' }}>{recordsData.total_count}</div>
                    </div>
                    <div className="status-card" style={{ maxWidth: 'none', margin: 0 }}>
                      <div className="label">Assigned to {PARTICIPANT_LABEL_PLURAL}</div>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#1a1a2e', marginTop: '4px' }}>{recordsData.assigned_count}</div>
                    </div>
                    <div className="status-card" style={{ maxWidth: 'none', margin: 0 }}>
                      <div className="label">Unassigned / Available</div>
                      <div style={{ fontSize: '24px', fontWeight: 600, color: '#1a1a2e', marginTop: '4px' }}>{recordsData.unassigned_count}</div>
                    </div>
                    {recordsData.unblinded_count > 0 && (
                      <div className="status-card" style={{ maxWidth: 'none', margin: 0, borderLeftColor: '#c0392b' }}>
                        <div className="label">Emergency Unblinded</div>
                        <div style={{ fontSize: '24px', fontWeight: 600, color: '#1a1a2e', marginTop: '4px' }}>{recordsData.unblinded_count}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sites Table */}
                <div style={{ marginBottom: '24px' }}>
                  <div className="section-header" style={{ marginBottom: '8px' }}>
                    <h3 className="section-title" style={{ fontSize: '15px' }}>Sites</h3>
                  </div>
                  <div className="table-scroll table-scroll--bordered">
                    {loadingSites ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '14px' }}>
                        Loading sites...
                      </div>
                    ) : sitesData.length > 0 ? (
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Site</th>
                            <th>Strata</th>
                            <th>{INVESTIGATOR_LABEL}s</th>
                            <th>Total Records</th>
                            <th>Assigned</th>
                            <th>Unassigned</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sitesData.map((site) => (
                            <tr key={site.id}>
                              <td style={{ fontWeight: 600 }}>{site.name}</td>
                              <td>{site.strata_count}</td>
                              <td>{site.investigator_count ?? 0}</td>
                              <td>{site.total_records}</td>
                              <td>{site.assigned}</td>
                              <td>{site.unassigned}</td>
                              <td>
                                <Link
                                  to={`/organizer/studies/${studyId}/sites/${site.id}/investigators`}
                                  className="btn-secondary"
                                  style={{ textDecoration: 'none', fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                                >
                                  Add Site {INVESTIGATOR_LABEL}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '14px' }}>
                        No sites configured for this study.
                      </div>
                    )}
                  </div>
                </div>

                {/* Arm Breakdown Table */}
                {recordsData && recordsData.arm_counts && recordsData.arm_counts.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <div className="section-header" style={{ marginBottom: '8px' }}>
                      <h3 className="section-title" style={{ fontSize: '15px' }}>Arm Allocation Breakdown</h3>
                    </div>
                    <div className="table-scroll table-scroll--bordered">
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Intervention Arm</th>
                            <th>Total Records</th>
                            <th>Assigned</th>
                            <th>Unassigned</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recordsData.arm_counts.map((arm, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{arm.treatment_name}</td>
                              <td>{arm.total}</td>
                              <td>{arm.assigned}</td>
                              <td>{arm.unassigned}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Main Data Table Container */}
                <div style={{ border: '1px solid #d0d0d0', borderRadius: '4px', overflow: 'hidden', background: '#ffffff' }}>
                  {/* Table Header Controls */}
                  <div className="table-toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid #d0d0d0', background: '#f8f9fa' }}>
                    <div className="table-toolbar__header">
                      <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a2e', margin: 0 }}>Randomized Sequence Records</h2>
                      <span className="badge badge--active">
                        {study.status === 'Generated'
                          ? 'Generated'
                          : study.status === 'Complete'
                            ? 'Complete'
                            : 'Active Study'}
                      </span>
                    </div>

                    <div className="table-toolbar__actions">
                      <div className="table-toolbar__buttons">
                        <button
                          type="button"
                          className="btn-secondary"
                          style={TABLE_ACTION_BTN_STYLE}
                          onClick={handleExportRecords}
                          disabled={exportingRecords || !recordsData?.total_count}
                        >
                          {exportingRecords ? 'Exporting…' : 'Export CSV'}
                        </button>

                        {study.status === 'Generated' && (
                          <Link
                            to={`/organizer/studies/${studyId}/upload-csv`}
                            className="btn-secondary"
                            style={{ ...TABLE_ACTION_BTN_STYLE, textDecoration: 'none' }}
                          >
                            Re-upload CSV
                          </Link>
                        )}
                      </div>

                      <div className="table-toolbar__filters-row table-toolbar__filters-row--primary">
                        <div className="field table-toolbar__filter-field">
                          <label htmlFor="records-site-filter">Site</label>
                          <select
                            id="records-site-filter"
                            value={siteFilter}
                            onChange={handleSiteFilterChange}
                            className="select-input"
                            style={{
                              padding: '6px 10px',
                              fontSize: '13px',
                            }}
                          >
                            <option value="">All Sites</option>
                            {sitesData.map((site) => (
                              <option key={site.id} value={site.id}>
                                {site.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field table-toolbar__filter-field">
                          <label htmlFor="records-strata-filter">Strata</label>
                          <select
                            id="records-strata-filter"
                            value={strataFilter}
                            onChange={handleStrataFilterChange}
                            className="select-input"
                            style={{
                              padding: '6px 10px',
                              fontSize: '13px',
                            }}
                          >
                            <option value="">All Strata</option>
                            {stratasData.map((strata) => (
                              <option key={strata.name} value={strata.name}>
                                {strata.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field table-toolbar__filter-field">
                          <label htmlFor="records-status-filter">Status</label>
                          <select
                            id="records-status-filter"
                            value={statusFilter}
                            onChange={handleFilterChange}
                            className="select-input"
                            style={{
                              padding: '6px 10px',
                              fontSize: '13px',
                            }}
                          >
                            <option value="">All</option>
                            <option value="assigned">Assigned</option>
                            <option value="unassigned">Unassigned</option>
                            <option value="blinded">Blinded</option>
                            <option value="unblinded">Unblinded</option>
                          </select>
                        </div>
                      </div>

                      <div className="table-toolbar__filters-row table-toolbar__filters-row--secondary">
                        <div className="field table-toolbar__filter-field">
                          <label htmlFor="records-search">Search</label>
                          <input
                            id="records-search"
                            type="text"
                            placeholder={`kit, site, strata, arm, ${PARTICIPANT_LABEL.toLowerCase()} ID, investigator ID, name...`}
                            value={search}
                            onChange={handleSearchChange}
                            className="field input"
                            style={{
                              padding: '6px 10px',
                              fontSize: '13px',
                              border: '1px solid #b0b0b0',
                              borderRadius: '3px',
                              outline: 'none',
                            }}
                          />
                        </div>

                        <div className="field table-toolbar__filter-field">
                          <label htmlFor="records-per-page">Pagination</label>
                          <select
                            id="records-per-page"
                            value={perPage}
                            onChange={handlePerPageChange}
                            className="select-input"
                            style={{
                              padding: '6px 10px',
                              fontSize: '13px',
                            }}
                          >
                            <option value={10}>10 per page</option>
                            <option value={20}>20 per page</option>
                            <option value={50}>50 per page</option>
                            <option value={100}>100 per page</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Table */}
                  {loadingRecords ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#555', fontSize: '14px' }}>
                      Loading sequence records...
                    </div>
                  ) : recordsData && recordsData.records.length > 0 ? (
                    <div className="table-scroll">
                      <table className="data-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: '80px' }}>Seq #</th>
                            <th>Kit Code</th>
                            <th>Site</th>
                            <th>Strata</th>
                            <th>Intervention Arm</th>
                            <th>Blind Status</th>
                            <th>{PARTICIPANT_LABEL} ID</th>
                            <th>{INVESTIGATOR_LABEL} ID</th>
                            <th>{INVESTIGATOR_LABEL} Name</th>
                            <th>Assigned Date</th>
                            <th>Unblinded At</th>
                            <th>Unblind Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recordsData.records.map((rec) => (
                            <tr key={rec.id}>
                              <td style={{ fontWeight: 600 }}>#{rec.sequence_number}</td>
                              <td style={{ fontFamily: 'monospace' }}>{rec.kit_code}</td>
                              <td>{rec.site_name || '—'}</td>
                              <td>{rec.strata_name || '—'}</td>
                              <td>{rec.treatment_name}</td>
                              <td>
                                {rec.blind ? (
                                  'Blinded'
                                ) : (
                                  <span className="badge badge--inactive" style={{ color: '#c0392b', borderColor: '#c0392b', background: 'transparent' }}>
                                    UNBLINDED
                                  </span>
                                )}
                              </td>
                              <td>
                                {rec.assigned_patient_id ? (
                                  <strong style={{ color: '#1a1a2e' }}>{rec.assigned_patient_id}</strong>
                                ) : (
                                  <span style={{ color: '#888', fontStyle: 'italic' }}>Unassigned</span>
                                )}
                              </td>
                              <td>
                                {rec.assigned_by_investigator_username ? (
                                  rec.assigned_by_investigator_username
                                ) : rec.assigned_by_investigator_id ? (
                                  `ID #${rec.assigned_by_investigator_id}`
                                ) : (
                                  <span style={{ color: '#888' }}>—</span>
                                )}
                              </td>
                              <td>
                                {rec.assigned_by_investigator_id ? (
                                  rec.assigned_by_investigator_name?.trim()
                                    || rec.assigned_by_investigator_email
                                    || <span style={{ color: '#888' }}>—</span>
                                ) : (
                                  <span style={{ color: '#888' }}>—</span>
                                )}
                              </td>
                              <td style={{ color: '#555' }}>
                                {rec.assigned_at ? new Date(rec.assigned_at).toLocaleString() : '—'}
                              </td>
                              <td style={{ color: '#555' }}>
                                {rec.unblinded_at ? new Date(rec.unblinded_at).toLocaleString() : '—'}
                              </td>
                              <td style={{ color: '#555', maxWidth: '220px', whiteSpace: 'pre-wrap' }}>
                                {rec.unblind_reason || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#555' }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>No sequence records match your filter.</p>
                      {search && <p style={{ fontSize: '13px', marginTop: '4px', color: '#888' }}>Try clearing your search query "{search}".</p>}
                    </div>
                  )}

                  {/* Pagination Footer */}
                  {recordsData && recordsData.total_pages > 1 && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #d0d0d0', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '13px', color: '#555' }}>
                        Showing <strong>{(recordsData.page - 1) * recordsData.per_page + 1}</strong>–<strong>{Math.min(recordsData.page * recordsData.per_page, recordsData.total_count)}</strong> of <strong>{recordsData.total_count}</strong> records
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          disabled={recordsData.page <= 1 || loadingRecords}
                          onClick={() => setPage((p) => Math.max(p - 1, 1))}
                          className="btn-secondary"
                        >
                          Previous
                        </button>
                        <span style={{ fontSize: '13px', color: '#333', fontWeight: 600, padding: '0 4px' }}>
                          Page {recordsData.page} of {recordsData.total_pages}
                        </span>
                        <button
                          type="button"
                          disabled={recordsData.page >= recordsData.total_pages || loadingRecords}
                          onClick={() => setPage((p) => Math.min(p + 1, recordsData.total_pages))}
                          className="btn-secondary"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}

export default StudyHome
