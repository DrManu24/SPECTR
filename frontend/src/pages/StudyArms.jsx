import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, parseApiError } from '../api'
import Header from '../components/Header'

function StudyArms() {
  const { studyId } = useParams()
  const navigate = useNavigate()
  const [study, setStudy] = useState(null)
  const [arms, setArms] = useState([])
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiFetch(`/organizer/studies/${studyId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStudy(data)
          if (data.treatment_arms && data.treatment_arms.length > 0) {
            setArms(
              data.treatment_arms.map((arm) => ({
                name: arm.name,
                short_code: arm.short_code,
                allocation_ratio: arm.allocation_ratio,
                description: arm.description ?? '',
              }))
            )
          }
        }
      })
      .catch(() => navigate('/organizer/home', { replace: true }))
  }, [studyId, navigate])

  function handleArmChange(index, field, value) {
    setArms((prev) =>
      prev.map((arm, i) => (i === index ? { ...arm, [field]: value } : arm))
    )
  }

  function handleAddArm() {
    const nextChar = String.fromCharCode(65 + arms.length)
    setArms((prev) => [
      ...prev,
      {
        name: `Arm ${nextChar}`,
        short_code: `ARM_${nextChar}`,
        allocation_ratio: 1,
        description: '',
      },
    ])
  }

  function handleRemoveArm(index) {
    setArms((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (arms.length === 0) {
      setError('Please add at least one intervention arm before saving.')
      return
    }

    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i]
      if (!arm.name.trim() || !arm.short_code.trim()) {
        setError(`Intervention Arm #${i + 1} requires a valid Name and Short Code.`)
        return
      }
      if (parseInt(arm.allocation_ratio, 10) < 1) {
        setError(`Intervention Arm #${i + 1} allocation ratio must be at least 1.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await apiFetch(`/organizer/studies/${studyId}/arms`, {
        method: 'POST',
        json: arms.map((arm) => ({
          name: arm.name.trim(),
          short_code: arm.short_code.trim(),
          allocation_ratio: parseInt(arm.allocation_ratio, 10) || 1,
          description: arm.description.trim() || null,
        })),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(parseApiError(data.detail) || 'Failed to save intervention arms.')
        return
      }

      navigate(`/organizer/studies/${studyId}/home`, {
        state: { successMsg: 'Intervention arms saved successfully.' },
      })
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
        <div className="page-header">
          <Link to={`/organizer/studies/${studyId}/home`} className="back-link">
            ← Back to Study
          </Link>
          <h1>{study ? study.title : 'Loading…'} — Intervention Arms</h1>
        </div>

        {!study ? (
          <p className="loading">Loading study…</p>
        ) : (
          <div className="study-form-card">
            <div className="setup-card__header">
              <span className="setup-badge">Intervention Arms</span>
              <h2 style={{ marginTop: '8px' }}>Configure Intervention Arms</h2>
              <p>Define the arms of the trial and their allocation ratios.</p>
            </div>

            {study.status === 'Active' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px 16px', margin: '16px 24px 0', color: '#991b1b', fontSize: '14px' }}>
                <strong>Study is Active and locked.</strong> Intervention arms cannot be added, edited, or deleted.
              </div>
            )}

            <form className="setup-form" onSubmit={handleSubmit} noValidate>
              {error && <p className="error">{error}</p>}

              <div className="arms-section" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div className="section-header" style={{ marginBottom: '12px' }}>
                  <h3 className="section-title" style={{ fontSize: '15px' }}>
                    Arms
                  </h3>
                  {study.status !== 'Active' && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleAddArm}
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                    >
                      + Add Arm
                    </button>
                  )}
                </div>

                <div className="arms-list">
                  {arms.length === 0 ? (
                    <div className="empty-state" style={{ margin: '8px 0 16px' }}>
                      <p>No arms yet. Click <strong>+ Add Arm</strong> to define intervention arms for this study.</p>
                    </div>
                  ) : (
                    arms.map((arm, index) => (
                      <div key={index} className="arm-card">
                        <div className="arm-card__header">
                          <span className="arm-number">Arm #{index + 1}</span>
                          {study.status !== 'Active' && (
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => handleRemoveArm(index)}
                              title="Remove this intervention arm"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="arm-grid">
                          <div className="field">
                            <label htmlFor={`arm-name-${index}`}>Name / Label *</label>
                            <input
                              id={`arm-name-${index}`}
                              type="text"
                              value={arm.name}
                              disabled={study.status === 'Active'}
                              onChange={(e) => handleArmChange(index, 'name', e.target.value)}
                              placeholder="e.g. Drug A (100mg Capsule)"
                              required
                            />
                          </div>

                          <div className="field">
                            <label htmlFor={`arm-code-${index}`}>Short Code *</label>
                            <input
                              id={`arm-code-${index}`}
                              type="text"
                              value={arm.short_code}
                              disabled={study.status === 'Active'}
                              onChange={(e) => handleArmChange(index, 'short_code', e.target.value)}
                              placeholder="e.g. ARM_A"
                              required
                            />
                          </div>

                          <div className="field">
                            <label htmlFor={`arm-ratio-${index}`}>Allocation Ratio *</label>
                            <input
                              id={`arm-ratio-${index}`}
                              type="number"
                              min="1"
                              value={arm.allocation_ratio}
                              disabled={study.status === 'Active'}
                              onChange={(e) =>
                                handleArmChange(index, 'allocation_ratio', e.target.value)
                              }
                              placeholder="1"
                              required
                            />
                          </div>

                          <div className="field">
                            <label htmlFor={`arm-desc-${index}`}>Description / Notes</label>
                            <input
                              id={`arm-desc-${index}`}
                              type="text"
                              value={arm.description}
                              disabled={study.status === 'Active'}
                              onChange={(e) =>
                                handleArmChange(index, 'description', e.target.value)
                              }
                              placeholder="Optional dosing instructions or notes"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: '24px' }}>
                {study.status !== 'Active' && (
                  <button
                    id="btn-save-arms"
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving…' : 'Save Intervention Arms'}
                  </button>
                )}
                <Link
                  to={`/organizer/studies/${studyId}/home`}
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        )}
      </main>
    </>
  )
}

export default StudyArms
