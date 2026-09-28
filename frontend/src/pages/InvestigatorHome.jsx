import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch, apiLogout, clearCsrfToken, parseApiError, storeCsrfFromResponse } from '../api'
import Header from '../components/Header'
import InclusionExclusionModal from '../components/InclusionExclusionModal'
import { INVESTIGATOR_LABEL, ORGANIZER_LABEL, PARTICIPANT_LABEL } from '../labels'
import { BLINDING_TYPE, investigatorIsBlinded } from '../utils/blindingType'
import { downloadCsv, rowsToCsv } from '../utils/csv'

function formatExportDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function formatAssignedAt(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

function redirectIfSessionExpired(res, navigate) {
  if (res.status === 401) {
    clearCsrfToken()
    navigate('/investigator/login?session=expired', { replace: true })
    return true
  }
  return false
}

function hasInclusionExclusionCriteria(criteria) {
  if (!criteria) return false
  return (
    (criteria.inclusions?.length ?? 0) > 0
    || (criteria.exclusions?.length ?? 0) > 0
  )
}

function PbTreatmentArmCell({ treatmentName, revealed, onView }) {
  if (revealed) {
    return <span>{treatmentName || '—'}</span>
  }

  return (
    <span className="pb-treatment-arm">
      <span className="pb-treatment-arm__text" aria-hidden="true">
        {treatmentName || 'Unknown'}
      </span>
      <button
        type="button"
        className="btn-secondary pb-treatment-arm__view"
        onClick={onView}
      >
        View
      </button>
    </span>
  )
}

function InvestigatorHome() {
  const navigate = useNavigate()
  const [investigator, setInvestigator] = useState(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)

  // Participant randomization form state
  const [patientId, setPatientId] = useState('')
  const [strataOptions, setStrataOptions] = useState([])
  const [selectedStrataId, setSelectedStrataId] = useState('')
  const [assignedRecord, setAssignedRecord] = useState(null)
  const [assignedList, setAssignedList] = useState([])
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [ieAttested, setIeAttested] = useState(false)
  const [showIeModal, setShowIeModal] = useState(false)
  const idempotencyKeyRef = useRef(null)

  function loadStrataAvailability() {
    return apiFetch('/investigator/strata-availability')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return
        setStrataOptions(data)
        setSelectedStrataId((current) => {
          if (current && data.some((s) => String(s.id) === String(current) && s.unassigned_count > 0)) {
            return current
          }
          const firstAvailable = data.find((s) => s.unassigned_count > 0)
          return firstAvailable ? String(firstAvailable.id) : ''
        })
      })
      .catch(() => setStrataOptions([]))
  }

  // Emergency unblinding state
  const [unblindedRecords, setUnblindedRecords] = useState({})
  const [unblindModalRecord, setUnblindModalRecord] = useState(null)
  const [unblindReason, setUnblindReason] = useState('')
  const [unblindError, setUnblindError] = useState(null)
  const [unblindingSubmitting, setUnblindingSubmitting] = useState(false)
  const [revealedPbArms, setRevealedPbArms] = useState({})

  function loadAssignments() {
    apiFetch('/investigator/assignments')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAssignedList(data)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    apiFetch('/investigator/me')
      .then((res) => {
        if (!res.ok) {
          navigate('/investigator/login', { replace: true })
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          storeCsrfFromResponse(data)
          setInvestigator(data)
          loadAssignments()
          loadStrataAvailability()
        }
      })
      .catch(() => navigate('/investigator/login', { replace: true }))
  }, [navigate])

  useEffect(() => {
    idempotencyKeyRef.current = null
    setIeAttested(false)
  }, [patientId, selectedStrataId])

  async function handleLogout() {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      const ok = await apiLogout('/investigator/logout')
      if (ok) {
        navigate('/investigator/login', { replace: true })
      } else {
        setLogoutError('Logout failed. Please try again.')
      }
    } catch {
      setLogoutError('Could not connect to backend.')
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleAssignKit(e) {
    e.preventDefault()
    setError(null)
    setAssignedRecord(null)

    const trimmed = patientId.trim()
    if (!trimmed) {
      setError(`Please enter a valid ${PARTICIPANT_LABEL} ID.`)
      return
    }

    if (!selectedStrataId) {
      setError('Please select a stratum with available kit codes.')
      return
    }

    const selectedStrata = strataOptions.find((s) => String(s.id) === String(selectedStrataId))
    if (!selectedStrata || selectedStrata.unassigned_count <= 0) {
      setError('No unassigned kit codes remain for the selected stratum.')
      return
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }

    setSubmitting(true)

    try {
      const res = await apiFetch('/investigator/assign-kit', {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        json: {
          patient_id: trimmed,
          strata_id: parseInt(selectedStrataId, 10),
        },
      })
      const data = await res.json()

      if (redirectIfSessionExpired(res, navigate)) return

      if (!res.ok) {
        setError(parseApiError(data.detail) || 'Randomization failed.')
        return
      }

      idempotencyKeyRef.current = null
      setAssignedRecord(data)
      setPatientId('')
      setIeAttested(false)
      loadAssignments()
      loadStrataAvailability()
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenUnblindModal(rec) {
    setUnblindError(null)
    setUnblindReason('')
    setUnblindModalRecord(rec)
  }

  function handleCloseUnblindModal() {
    if (unblindingSubmitting) return
    setUnblindModalRecord(null)
    setUnblindReason('')
    setUnblindError(null)
  }

  async function handleConfirmUnblind() {
    if (!unblindModalRecord) return
    const trimmedReason = unblindReason.trim()
    if (trimmedReason.length < 10) {
      setUnblindError('Please enter a clinical rationale of at least 10 characters.')
      return
    }
    setUnblindError(null)
    setUnblindingSubmitting(true)

    try {
      const res = await apiFetch(`/investigator/records/${unblindModalRecord.id}/unblind`, {
        method: 'POST',
        json: { reason: trimmedReason },
      })
      const data = await res.json()

      if (redirectIfSessionExpired(res, navigate)) return

      if (!res.ok) {
        setUnblindError(parseApiError(data.detail) || 'Emergency unblinding failed.')
        return
      }

      setUnblindedRecords((prev) => ({
        ...prev,
        [unblindModalRecord.id]: data.treatment_name,
      }))
      setUnblindModalRecord(null)
      loadAssignments()
    } catch {
      setUnblindError('Could not connect to backend.')
    } finally {
      setUnblindingSubmitting(false)
    }
  }

  function getTreatmentArmForExport(rec) {
    if (!investigatorBlinded) {
      return rec.treatment_name || ''
    }
    if (!rec.blind || unblindedRecords[rec.id]) {
      return unblindedRecords[rec.id] || rec.treatment_name || ''
    }
    return ''
  }

  function handleExportAssignments() {
    const headers = [
      '#',
      `${PARTICIPANT_LABEL} ID`,
      'Kit Code',
      'Assigned By',
      `${INVESTIGATOR_LABEL} Name`,
      `${INVESTIGATOR_LABEL} Email`,
      'Assigned At',
      'Unblinded At',
      'Unblind Reason',
      'Treatment Arm',
    ]

    const rows = filteredAssignments.map((rec, index) => [
      index + 1,
      rec.assigned_patient_id || '',
      rec.kit_code || '',
      rec.assigned_by_investigator_username || '',
      rec.assigned_by_investigator_id ? (rec.assigned_by_investigator_name || '') : '',
      rec.assigned_by_investigator_id ? (rec.assigned_by_investigator_email || '') : '',
      formatExportDateTime(rec.assigned_at),
      formatExportDateTime(rec.unblinded_at),
      rec.unblind_reason || '',
      getTreatmentArmForExport(rec),
    ])

    const siteSlug = investigator?.site_name
      ? investigator.site_name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
      : 'site'
    const filename = `${siteSlug}-participant-records.csv`
    downloadCsv(filename, rowsToCsv(headers, rows))
  }

  const investigatorBlinded = investigatorIsBlinded(investigator?.blinding_type)
  const isParticipantBlinding = investigator?.blinding_type === BLINDING_TYPE.PB
  const selectedStrata = strataOptions.find((s) => String(s.id) === String(selectedStrataId))
  const requiresIeAttestation = hasInclusionExclusionCriteria(
    investigator?.inclusion_exclusion_criteria
  )
  const assignmentSearchTerm = assignmentSearch.trim().toLowerCase()
  const filteredAssignments = assignmentSearchTerm
    ? assignedList.filter((rec) =>
        rec.assigned_patient_id?.toLowerCase().includes(assignmentSearchTerm)
      )
    : assignedList

  const canAssign = Boolean(
    patientId.trim()
    && selectedStrata
    && selectedStrata.unassigned_count > 0
    && (!requiresIeAttestation || ieAttested)
  )
  const unblindReasonValid = unblindReason.trim().length >= 10
  const assignedAtLabel = assignedRecord ? formatAssignedAt(assignedRecord.assigned_at) : null

  function handleIeCheckboxChange() {
    if (ieAttested) {
      setIeAttested(false)
      return
    }
    setShowIeModal(true)
  }

  function handleIeAttest() {
    setIeAttested(true)
    setShowIeModal(false)
  }

  function handleIeDecline() {
    setIeAttested(false)
    setShowIeModal(false)
  }

  return (
    <>
      <Header>
        {investigator && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link
              to="/investigator/change-password"
              className="btn-primary"
              style={{ textDecoration: 'none', padding: '6px 14px', fontSize: '13px' }}
            >
              Change Password
            </Link>
            <button
              className="btn-secondary"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        )}
      </Header>

      <main className="app">
        {!investigator ? (
          <p className="loading">Verifying session…</p>
        ) : (
          <>
            {logoutError && <p className="error">{logoutError}</p>}
            <h1>{investigator.study_title || `${INVESTIGATOR_LABEL} Dashboard`}</h1>

            {investigator.study_description && (
              <p style={{ fontSize: '15px', color: '#444', marginTop: '0', marginBottom: '24px', lineHeight: '1.5' }}>
                {investigator.study_description}
              </p>
            )}

            <div className="status-card" style={{ marginBottom: '28px' }}>
              <div className="label">Session Status</div>
              <p className="message">
                Logged in as <strong>{investigator.name || investigator.username}</strong>
                {' '}· Trial ID: <strong>{investigator.trial_id}</strong>
                {' '}· Username: <code>{investigator.username}</code>
                {investigator.site_name && (
                  <>
                    {' '}· Site: <strong>{investigator.site_name}</strong>
                  </>
                )}
              </p>
            </div>

            {/* Randomization & Kit Assignment Form */}
            <div className="study-form-card" style={{ marginTop: '24px' }}>
              <div className="setup-card__header">
                <span className="setup-badge">Randomization & Kit Assignment</span>
                <h2 style={{ marginTop: '8px' }}>Randomize {PARTICIPANT_LABEL}</h2>
                <p>Enter the {PARTICIPANT_LABEL} ID and stratum to randomize and receive the next available kit code at your site.</p>
              </div>

              <form className="setup-form" onSubmit={handleAssignKit} noValidate>
                {error && <p className="error">{error}</p>}

                {assignedRecord && (
                  <div
                    className={
                      assignedRecord.assignment_outcome === 'already_assigned'
                        ? 'info-msg kit-assigned-msg'
                        : 'success-msg kit-assigned-msg'
                    }
                  >
                    <div className="kit-assigned-msg__code">{assignedRecord.kit_code}</div>
                    <div className="kit-assigned-msg__detail">
                      {assignedRecord.assignment_outcome === 'already_assigned' ? (
                        <>
                          {PARTICIPANT_LABEL} <strong>{assignedRecord.assigned_patient_id}</strong> was already
                          assigned kit code <code>{assignedRecord.kit_code}</code>
                          {assignedAtLabel && (
                            <> on {assignedAtLabel}</>
                          )}
                          .
                        </>
                      ) : (
                        <>
                          Kit code <code>{assignedRecord.kit_code}</code> assigned to {PARTICIPANT_LABEL.toLowerCase()}{' '}
                          <strong>{assignedRecord.assigned_patient_id}</strong>.
                        </>
                      )}
                    </div>
                  </div>
                )}

                {assignedRecord && isParticipantBlinding && (
                  <div className="pb-blinding-warning">
                    This study is <strong>Participant Blinded (PB)</strong>. Do not disclose the assigned treatment arm to the <strong>{PARTICIPANT_LABEL}</strong>.
                  </div>
                )}

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="participant-id">{PARTICIPANT_LABEL} ID / Subject ID *</label>
                    <input
                      id="participant-id"
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="e.g. PAT-1001"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="strata-select">Stratum *</label>
                    <select
                      id="strata-select"
                      className="select-input"
                      value={selectedStrataId}
                      onChange={(e) => setSelectedStrataId(e.target.value)}
                      disabled={strataOptions.length === 0}
                      required
                    >
                      <option value="">
                        {strataOptions.length === 0
                          ? 'No strata available'
                          : 'Select stratum'}
                      </option>
                      {strataOptions.map((strata) => (
                        <option
                          key={strata.id}
                          value={strata.id}
                          disabled={strata.unassigned_count <= 0}
                        >
                          {strata.name} ({strata.unassigned_count} available)
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      {selectedStrata
                        ? selectedStrata.unassigned_count > 0
                          ? `${selectedStrata.unassigned_count} unassigned kit code(s) remain for this stratum at your site.`
                          : 'No unassigned kit codes remain for this stratum.'
                        : 'Choose a stratum to unlock randomization.'}
                    </span>
                  </div>

                  <div className="field field-full">
                    <span className="field-hint">
                      Note: {PARTICIPANT_LABEL} ID must be unique within the study to maintain auditability and support emergency unblinding if required.
                    </span>
                  </div>

                  {requiresIeAttestation && (
                    <div className="field field-full field-checkbox">
                      <label htmlFor="ie-attest" className="checkbox-label">
                        <input
                          id="ie-attest"
                          type="checkbox"
                          checked={ieAttested}
                          onChange={handleIeCheckboxChange}
                        />
                        <span>Attest that the patient meets inclusion/exclusion criteria</span>
                      </label>
                      <span className="field-hint">
                        Select to review the study I/E criteria and confirm eligibility before randomizing.
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-actions" style={{ marginTop: '20px' }}>
                  <button
                    id="btn-randomize"
                    type="submit"
                    className="btn-primary"
                    disabled={submitting || !canAssign}
                  >
                    {submitting ? 'Randomizing…' : 'Randomize'}
                  </button>
                </div>
              </form>
            </div>

            {/* Recent Kit Assignments */}
            {assignedList.length > 0 && (
              <div style={{ marginTop: '36px' }}>
                <div className="section-header">
                  <h2 className="section-title">
                    Site {PARTICIPANT_LABEL} Records
                    {assignmentSearchTerm
                      ? ` (${filteredAssignments.length} of ${assignedList.length})`
                      : ` (${assignedList.length})`}
                  </h2>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
                      onClick={handleExportAssignments}
                      disabled={filteredAssignments.length === 0}
                    >
                      Export Site {PARTICIPANT_LABEL} Records
                    </button>
                    <input
                      type="text"
                      placeholder={`Search ${PARTICIPANT_LABEL.toLowerCase()} ID...`}
                      value={assignmentSearch}
                      onChange={(e) => setAssignmentSearch(e.target.value)}
                      className="field input"
                      style={{
                        padding: '6px 10px',
                        fontSize: '13px',
                        border: '1px solid #b0b0b0',
                        borderRadius: '3px',
                        width: '210px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {filteredAssignments.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                    No records match your search.
                    {assignmentSearchTerm && (
                      <> Try clearing your search query &quot;{assignmentSearch}&quot;.</>
                    )}
                  </p>
                ) : (
                  <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{PARTICIPANT_LABEL} ID</th>
                        <th>Kit Code</th>
                        <th>Assigned By</th>
                        <th>Treatment Arm</th>
                        <th>Unblind Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssignments.map((rec, index) => (
                        <tr key={rec.id}>
                          <td>{index + 1}</td>
                          <td><strong>{rec.assigned_patient_id}</strong></td>
                          <td><code>{rec.kit_code}</code></td>
                          <td>
                            {rec.assigned_by_investigator_username ? (
                              <code>{rec.assigned_by_investigator_username}</code>
                            ) : (
                              <span style={{ color: '#888' }}>—</span>
                            )}
                          </td>
                          <td>
                            {investigatorBlinded ? (
                              !rec.blind || unblindedRecords[rec.id] ? (
                                <span
                                  style={{
                                    color: '#b91c1c',
                                    fontWeight: '600',
                                    background: '#fef2f2',
                                    padding: '2px 8px',
                                    borderRadius: '3px',
                                    border: '1px solid #fecaca',
                                    fontSize: '13px',
                                  }}
                                >
                                  Unblinded: {unblindedRecords[rec.id] || rec.treatment_name}
                                </span>
                              ) : (
                                <button
                                  className="btn-secondary"
                                  style={{ padding: '3px 10px', fontSize: '12px' }}
                                  onClick={() => handleOpenUnblindModal(rec)}
                                >
                                  Unblind
                                </button>
                              )
                            ) : isParticipantBlinding ? (
                              <PbTreatmentArmCell
                                treatmentName={rec.treatment_name}
                                revealed={revealedPbArms[rec.id]}
                                onView={() => setRevealedPbArms((prev) => ({ ...prev, [rec.id]: true }))}
                              />
                            ) : (
                              <span>{rec.treatment_name}</span>
                            )}
                          </td>
                          <td style={{ maxWidth: '220px', whiteSpace: 'pre-wrap' }}>
                            {rec.unblind_reason || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showIeModal && (
        <InclusionExclusionModal
          criteria={investigator?.inclusion_exclusion_criteria}
          onAttest={handleIeAttest}
          onDecline={handleIeDecline}
        />
      )}

      {/* Emergency Unblinding Modal */}
      {unblindModalRecord && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="setup-card"
            style={{
              maxWidth: '440px',
              width: '90%',
              background: '#ffffff',
              padding: '24px',
              borderRadius: '6px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#1a1a2e' }}>Emergency Unblinding Notice</h3>
            </div>

            <p style={{ fontSize: '14px', color: '#444', lineHeight: '1.5', margin: '0 0 14px' }}>
              You are requesting to unblind the treatment arm for {PARTICIPANT_LABEL} <strong>{unblindModalRecord.assigned_patient_id}</strong> (Kit <code>{unblindModalRecord.kit_code}</code>).
            </p>

            <p
              style={{
                fontSize: '13px',
                color: '#854d0e',
                background: '#fefce8',
                border: '1px solid #fef08a',
                padding: '10px 12px',
                borderRadius: '4px',
                margin: '0 0 16px',
                lineHeight: '1.4',
              }}
            >
              <strong>Notice:</strong> This unblinding event will be permanently recorded in the audit log and made visible to the study {ORGANIZER_LABEL}.
            </p>

            <div className="field" style={{ margin: '0 0 16px' }}>
              <label htmlFor="unblind-reason" style={{ fontSize: '13px', fontWeight: 600 }}>
                Clinical rationale (required)
              </label>
              <textarea
                id="unblind-reason"
                value={unblindReason}
                onChange={(e) => setUnblindReason(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Describe the clinical reason for this emergency unblinding."
                disabled={unblindingSubmitting}
                style={{
                  width: '100%',
                  marginTop: '6px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Minimum 10 characters ({unblindReason.trim().length}/10)
              </div>
            </div>

            {unblindError && (
              <p className="error" style={{ marginBottom: '16px' }}>
                {unblindError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCloseUnblindModal}
                disabled={unblindingSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmUnblind}
                disabled={unblindingSubmitting || !unblindReasonValid}
              >
                {unblindingSubmitting ? 'Unblinding…' : 'Confirm Unblind'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default InvestigatorHome
