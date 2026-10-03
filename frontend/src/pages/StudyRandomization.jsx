import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, parseApiError } from '../api'
import Header from '../components/Header'
const VALID_METHODS = ['Permuted Block', 'Simple Random', 'Minimization']

const METHOD_DESCRIPTIONS = {
  'Permuted Block':
    'Divides allocation into balanced blocks so arm distribution stays proportional throughout enrollment. Block size must be a multiple of the total allocation weight.',
  'Simple Random':
    'Each subject is independently assigned by weighted probability proportional to arm ratios. Simple and unbiased; may produce imbalanced runs in small samples.',
  'Minimization':
    'Adaptive balance correction — at each step, the most under-represented arm receives higher assignment probability. Keeps running arm counts close to target ratios.',
}

/* ──────────────────────────────────────────────
   Confirmation modal
────────────────────────────────────────────── */
function ConfirmGenerateModal({ study, arms, method, targetSampleSize, blockSizeRules, onConfirm, onCancel, submitting, error }) {
  const totalRatio = arms.reduce((s, a) => s + (parseInt(a.allocation_ratio, 10) || 1), 0)

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#1a1a2e' }}>
          Confirm Randomization Generation
        </h3>
        <p style={{ fontSize: '13px', color: '#555', margin: '0 0 20px', lineHeight: '1.6' }}>
          You are about to generate <strong>{targetSampleSize}</strong> randomization records for{' '}
          <strong>{study.title}</strong>. The study will be set to <strong>Active</strong> and this
          action cannot be undone.
        </p>

        {/* Settings summary */}
        <div style={{ border: '1px solid #d0d0d0', borderRadius: '4px', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ background: '#f8f9fa', borderBottom: '1px solid #d0d0d0', padding: '8px 14px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#666' }}>
              Generation Parameters
            </span>
          </div>
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: '#666' }}>Method: </span><strong>{method}</strong></div>
            <div><span style={{ color: '#666' }}>Sample size: </span><strong>{targetSampleSize}</strong></div>
            {method === 'Permuted Block' && blockSizeRules && (
              <div><span style={{ color: '#666' }}>Block size rules: </span><strong>{blockSizeRules}</strong></div>
            )}
          </div>
        </div>

        {/* Arm allocation preview */}
        <div style={{ border: '1px solid #d0d0d0', borderRadius: '4px', marginBottom: '16px', overflow: 'hidden' }}>
          <div style={{ background: '#f8f9fa', borderBottom: '1px solid #d0d0d0', padding: '8px 14px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#666' }}>
              Arm Allocation
            </span>
          </div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {arms.map((arm, i) => {
              const expected = Math.round((targetSampleSize * (parseInt(arm.allocation_ratio, 10) || 1)) / totalRatio)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span><strong>{arm.name}</strong> <span style={{ color: '#666' }}>({arm.short_code})</span></span>
                  <span style={{ color: '#555' }}>
                    Ratio {arm.allocation_ratio} — approx. <strong>{expected}</strong> records
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="error" style={{ marginBottom: '14px', maxWidth: 'none' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Generating...' : `Confirm — Generate ${targetSampleSize} Records`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════
   Main Page
══════════════════════════════════════════════ */
function StudyRandomization() {
  const { studyId } = useParams()
  const navigate = useNavigate()
  const [study, setStudy] = useState(null)
  const [arms, setArms] = useState([])

  // Form state — mirrors study model fields
  const [targetSampleSize, setTargetSampleSize] = useState('')
  const [randomizationMethod, setRandomizationMethod] = useState('Permuted Block')
  const [blockSizeRules, setBlockSizeRules] = useState('')

  // UI state
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [showConfirm, setShowConfirm] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    apiFetch(`/organizer/studies/${studyId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStudy(data)
          setArms(data.treatment_arms || [])
          setTargetSampleSize(data.target_sample_size ?? '')
          setRandomizationMethod(data.randomization_method ?? 'Permuted Block')
          setBlockSizeRules(data.block_size_rules ?? '')
        }
      })
      .catch(() => navigate('/organizer/home', { replace: true }))
  }, [studyId, navigate])

  /* ── Save settings only (no generation) ── */
  async function handleSaveOnly(e) {
    e.preventDefault()
    setSaveError(null)
    setSaveSuccess(false)

    setSaving(true)
    try {
      const res = await apiFetch(`/organizer/studies/${studyId}`, {
        method: 'PATCH',
        json: {
          target_sample_size: targetSampleSize !== '' ? parseInt(targetSampleSize, 10) : null,
          randomization_method: randomizationMethod,
          block_size_rules: blockSizeRules.trim() || null,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        setSaveError(parseApiError(data.detail) || 'Failed to save randomization settings.')
        return
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Could not connect to backend.')
    } finally {
      setSaving(false)
    }
  }

  /* ── Open confirm modal with front-end validation ── */
  function handleOpenConfirm() {
    setSaveError(null)
    setGenerateError(null)

    const n = parseInt(targetSampleSize, 10)
    if (!targetSampleSize || n < 1) {
      setSaveError('A valid Target Sample Size (minimum 1) is required before generating.')
      return
    }
    if (randomizationMethod === 'Permuted Block' && !blockSizeRules.trim()) {
      setSaveError('Block size rules are required for Permuted Block randomization.')
      return
    }
    if (arms.length === 0) {
      setSaveError('No intervention arms are configured. Return to the Arms page to define them before generating.')
      return
    }
    setShowConfirm(true)
  }

  /* ── Call generate endpoint ── */
  async function handleConfirmGenerate() {
    setGenerateError(null)
    setGenerating(true)

    try {
      const res = await apiFetch(`/organizer/studies/${studyId}/generate-randomization`, {
        method: 'POST',
        json: {
          target_sample_size: parseInt(targetSampleSize, 10),
          randomization_method: randomizationMethod,
          block_size_rules: blockSizeRules.trim() || null,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(parseApiError(data.detail) || 'Failed to generate randomization sequence.')
        return
      }
      navigate(`/organizer/studies/${studyId}/home`, {
        state: {
          successMsg: `Randomization sequence generated: ${data.inserted_count} records (seed: ${data.seed_used}). Study is now Active.`,
        },
      })
    } catch {
      setGenerateError('Could not connect to backend.')
    } finally {
      setGenerating(false)
    }
  }

  const isActive = study?.status === 'Active'
  const hasNoArms = arms.length === 0
  const totalRatio = arms.reduce((s, a) => s + (parseInt(a.allocation_ratio, 10) || 1), 0)

  return (
    <>
      <Header />
      <main className="app">
        <div className="page-header">
          <Link to={`/organizer/studies/${studyId}/home`} className="back-link">
            Back to Study
          </Link>
          <h1>{study ? study.title : 'Loading...'} — Randomization</h1>
        </div>

        {!study ? (
          <p className="loading">Loading study...</p>
        ) : (
          <div className="study-form-card">
            <div className="setup-card__header">
              <span className="setup-badge">Randomization</span>
              <h2 style={{ marginTop: '8px' }}>Randomization Settings</h2>
              <p>Configure the method, block sizing, and target sample size for this trial.</p>
            </div>

            {/* Active lock notice */}
            {isActive && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '10px 16px', margin: '16px 20px 0', color: '#991b1b', fontSize: '13px' }}>
                <strong>Study is Active and locked.</strong> Randomization settings cannot be modified.
              </div>
            )}

            {/* Arms not configured — informational notice only */}
            {!isActive && hasNoArms && (
              <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '4px', padding: '10px 16px', margin: '16px 20px 0', fontSize: '13px', color: '#854d0e' }}>
                <strong>No intervention arms configured.</strong> You may save these settings, but the sequence cannot be generated until at least one intervention arm is defined.{' '}
                <Link to={`/organizer/studies/${studyId}/arms`} style={{ color: '#2a6496', fontWeight: 600 }}>
                  Configure Arms
                </Link>
              </div>
            )}

            <form className="setup-form" onSubmit={handleSaveOnly} noValidate>
              {saveError && <p className="error">{saveError}</p>}
              {saveSuccess && <div className="success-msg">Settings saved successfully.</div>}

              <div className="form-grid">
                {/* Randomization Method */}
                <div className="field">
                  <label htmlFor="randomization-method">Randomization Method</label>
                  <select
                    id="randomization-method"
                    className="select-input"
                    value={randomizationMethod}
                    disabled={isActive}
                    onChange={(e) => setRandomizationMethod(e.target.value)}
                  >
                    {VALID_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  {randomizationMethod && (
                    <span className="field-hint">{METHOD_DESCRIPTIONS[randomizationMethod]}</span>
                  )}
                </div>

                {/* Target Sample Size */}
                <div className="field">
                  <label htmlFor="sample-size">
                    Target Sample Size{!isActive && <span style={{ color: '#c0392b' }}> *</span>}
                  </label>
                  <input
                    id="sample-size"
                    type="number"
                    min="1"
                    value={targetSampleSize}
                    disabled={isActive}
                    onChange={(e) => setTargetSampleSize(e.target.value)}
                    placeholder="e.g. 500"
                  />
                  <span className="field-hint">
                    Total number of randomization records to generate.
                  </span>
                </div>

                {/* Block Size Rules — only relevant for Permuted Block */}
                <div className="field">
                  <label htmlFor="block-size-rules">
                    Block Size Rules{randomizationMethod === 'Permuted Block' && !isActive && (
                      <span style={{ color: '#c0392b' }}> *</span>
                    )}
                  </label>
                  <input
                    id="block-size-rules"
                    type="text"
                    value={blockSizeRules}
                    disabled={isActive || randomizationMethod !== 'Permuted Block'}
                    onChange={(e) => setBlockSizeRules(e.target.value)}
                    placeholder="e.g. 4 or 4-6"
                  />
                  <span className="field-hint">
                    {randomizationMethod === 'Permuted Block'
                      ? `Fixed block size (e.g. 4) or variable range (e.g. 4-6). Must be a multiple of total arm weight (${totalRatio > 0 ? totalRatio : 'N/A'}).`
                      : 'Applicable only for Permuted Block.'}
                  </span>
                </div>
              </div>

              {/* Arm allocation summary (read-only, when arms exist) */}
              {arms.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#666', marginBottom: '8px' }}>
                    Configured Intervention Arms
                  </div>
                  <div className="table-scroll">
                  <table className="data-table" style={{ fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #d0d0d0' }}>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                        <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Code</th>
                        <th style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: '#444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ratio</th>
                        <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#444', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arms.map((arm, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e8e8e8' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1a1a1a' }}>{arm.name}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: '#555' }}>{arm.short_code}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#333' }}>{arm.allocation_ratio}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#333' }}>
                            {totalRatio > 0 ? `${((arm.allocation_ratio / totalRatio) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {!isActive && (
                    <div style={{ marginTop: '6px', textAlign: 'right' }}>
                      <Link to={`/organizer/studies/${studyId}/arms`} style={{ fontSize: '12px', color: '#2a6496', textDecoration: 'none', fontWeight: 600 }}>
                        Edit Intervention Arms
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions" style={{ marginTop: '24px' }}>
                {!isActive && (
                  <>
                    {/* PRIMARY: Generate & Activate */}
                    <button
                      id="btn-generate-randomization"
                      type="button"
                      className="btn-primary"
                      onClick={handleOpenConfirm}
                      disabled={generating || hasNoArms || !targetSampleSize}
                    >
                      {generating ? 'Generating...' : 'Generate Sequence and Activate Study'}
                    </button>

                    {/* SECONDARY: Save only */}
                    <button
                      id="btn-save-randomization"
                      type="submit"
                      className="btn-secondary"
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Settings Only'}
                    </button>
                  </>
                )}

                <Link
                  to={`/organizer/studies/${studyId}/home`}
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  {isActive ? 'Back to Study' : 'Cancel'}
                </Link>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Confirm Generate Modal */}
      {showConfirm && study && (
        <ConfirmGenerateModal
          study={study}
          arms={arms}
          method={randomizationMethod}
          targetSampleSize={parseInt(targetSampleSize, 10)}
          blockSizeRules={blockSizeRules.trim() || null}
          onConfirm={handleConfirmGenerate}
          onCancel={() => { setShowConfirm(false); setGenerateError(null) }}
          submitting={generating}
          error={generateError}
        />
      )}
    </>
  )
}

export default StudyRandomization
