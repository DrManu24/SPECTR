import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, apiUpload, storeCsrfFromResponse, parseApiError } from '../api'
import Header from '../components/Header'

// --- Sample CSV content (embedded so no static file config needed) ---
const SAMPLE_CSV_CONTENT = `sequence_number,kit_code,site,strata,treatment_arm
1,TRL-4821,Site 1 - University Hospital,Stratum A,Drug A
2,TRL-7390,Site 1 - University Hospital,Stratum A,Placebo
3,TRL-4821,Site 1 - University Hospital,Stratum A,Drug A
4,TRL-7390,Site 1 - University Hospital,Stratum A,Placebo
5,TRL-4821,Site 1 - University Hospital,Stratum A,Drug A
6,TRL-4821,Site 1 - University Hospital,Stratum B,Drug A
7,TRL-7390,Site 1 - University Hospital,Stratum B,Placebo
8,TRL-4821,Site 1 - University Hospital,Stratum B,Drug A
9,TRL-7390,Site 1 - University Hospital,Stratum B,Placebo
10,TRL-4821,Site 1 - University Hospital,Stratum B,Drug A
11,TRL-4821,Site 2 - Central Laboratory,Stratum A,Drug A
12,TRL-7390,Site 2 - Central Laboratory,Stratum A,Placebo
13,TRL-4821,Site 2 - Central Laboratory,Stratum A,Drug A
14,TRL-4821,Site 2 - Central Laboratory,Stratum B,Drug A
15,TRL-7390,Site 2 - Central Laboratory,Stratum B,Placebo
16,TRL-4821,Site 2 - Central Laboratory,Stratum B,Drug A
`

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sample_randomization.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Parse CSV text into { headers, rows } for the preview table
function parseCsvPreview(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line) =>
    line.split(',').map((cell) => cell.trim())
  )
  return { headers, rows }
}

function UploadCSV() {
  const { studyId } = useParams()
  const navigate = useNavigate()

  const [study, setStudy] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)   // { headers, rows }
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)     // CsvUploadResponse
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    apiFetch('/organizer/me')
      .then(async (res) => {
        if (!res.ok) {
          navigate('/organizer/login', { replace: true })
          return null
        }
        const me = await res.json()
        storeCsrfFromResponse(me)
        return apiFetch(`/organizer/studies/${studyId}`)
      })
      .then((studyRes) => {
        if (!studyRes) return
        if (!studyRes.ok) {
          navigate('/organizer/home', { replace: true })
          return
        }
        return studyRes.json()
      })
      .then((data) => { if (data) setStudy(data) })
      .catch(() => navigate('/organizer/login', { replace: true }))
  }, [studyId, navigate])

  function handleFileChange(e) {
    setError(null)
    setResult(null)
    const selected = e.target.files?.[0] ?? null
    setFile(selected)

    if (!selected) {
      setPreview(null)
      return
    }

    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.')
      setFile(null)
      setPreview(null)
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      setPreview(parseCsvPreview(text))
    }
    reader.readAsText(selected)
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return

    setError(null)
    setResult(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await apiUpload(
        `/organizer/studies/${studyId}/upload-randomization-csv`,
        formData
      )

      const data = await res.json()

      if (!res.ok) {
        setError(parseApiError(data.detail) || `Upload failed (${res.status}).`)
        return
      }

      setResult(data)
      // Refresh study to pick up status change
      apiFetch(`/organizer/studies/${studyId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setStudy(d) })
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setUploading(false)
    }
  }

  function handleReset() {
    setFile(null)
    setPreview(null)
    setError(null)
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const PREVIEW_LIMIT = 5

  return (
    <>
      <Header />
      <main className="app">
        <div className="page-header">
          <Link to={`/organizer/studies/${studyId}/home`} className="back-link">
            Back to Study
          </Link>
          <h1>{study ? study.title : 'Loading...'} - Upload Random Sequence</h1>
        </div>

        {!study ? (
          <p className="loading">Loading study...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '760px' }}>
            {(study.status === 'Active' || study.status === 'Complete') && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px 16px', color: '#991b1b', fontSize: '14px' }}>
                <strong>Study is locked.</strong> Sequence records cannot be replaced.
              </div>
            )}

            {study.status === 'Generated' && !result && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '12px 16px', color: '#1e3a8a', fontSize: '14px' }}>
                <strong>Generated study.</strong> Uploading a new CSV will replace all existing
                randomization records, sites, and stratas for this study.
              </div>
            )}

            {/* ── Instructions card ─────────────────────────────── */}
            <div className="setup-card">
              <div className="setup-card__header">
                <span className="setup-badge">Format</span>
                <h2 style={{ marginTop: '8px' }}>CSV Format Requirements</h2>
                <p>Use this page to upload a pre-randomized sequence directly into the study.</p>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <ul className="csv-instructions">
                  <li>File must be <strong>.csv</strong> with a header row as the first line.</li>
                  <li>
                    Required columns (in this order):{' '}
                    <code>sequence_number</code>, <code>kit_code</code>, <code>site</code>,{' '}
                    <code>strata</code>, <code>treatment_arm</code>
                  </li>
                  <li>
                    <code>sequence_number</code> — unique positive integer for each randomization slot,
                    listed in allocation order, across all strata — acting as a single global sequence.
                  </li>
                  <li>
                    <code>kit_code</code> — blinded kit identifier for the intervention arm (e.g.{' '}
                    <code>TRL-4821</code>, <code>TRL-7390</code>). You may use different identifiers
                    across sites or strata as needed. If unblinded trial, may use acronyms for the
                    intervention.
                  </li>
                  <li>
                    <code>site</code> — enrolling site name or code (hospital, clinic, laboratory, etc.).
                    The same value must appear on every record belonging to that site.{' '}
                    <strong>If single centre trial, use the site name globally.</strong>
                  </li>
                  <li>
                    <code>strata</code> — stratum label for the participant classification (e.g. age group,
                    disease stage, or other predefined subgroup). Within each site, the same stratum value
                    appears on many records according to your allocation plan — for example, Site 1 may
                    contain 15 records for Stratum A and 20 for Stratum B, and Site 2 would follow the
                    same stratum structure with its own record counts. If no strata are required, use{' '}
                    &ldquo;N/A&rdquo; globally.
                  </li>
                  <li>
                    <code>treatment_arm</code> — display name of the intervention arm (e.g. <em>Drug A</em>,{' '}
                    <em>Placebo</em>).
                  </li>
                  <li>Maximum file size: <strong>1 MB</strong>.</li>
                  <li>
                    Re-uploading <strong>replaces</strong> all existing randomization records, sites,
                    and stratas for this study.
                  </li>
                  <li>On success, study status is set to <strong>Generated</strong>.</li>
                </ul>

                <div>
                  <button
                    id="btn-download-sample"
                    type="button"
                    className="btn-secondary"
                    onClick={downloadSampleCsv}
                    style={{ fontSize: '13px' }}
                  >
                    Download Sample CSV
                  </button>
                </div>
              </div>
            </div>

            {/* ── Upload card ────────────────────────────────────── */}
            {!result && study.status !== 'Active' && study.status !== 'Complete' && (
              <div className="setup-card">
                <div className="setup-card__header">
                  <span className="setup-badge">Upload</span>
                  <h2 style={{ marginTop: '8px' }}>Select CSV File</h2>
                  <p>
                    {study.status === 'Generated'
                      ? 'Choose a new CSV file to replace the current randomization data.'
                      : 'Choose your randomization CSV file to preview and upload.'}
                  </p>
                </div>
                <form className="setup-form" onSubmit={handleUpload} noValidate>
                  {error && <p className="error">{error}</p>}

                  <div className="field csv-upload-area">
                    <label htmlFor="csv-file-input">CSV File</label>
                    <input
                      id="csv-file-input"
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                    />
                    {file && (
                      <span className="field-hint">
                        Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>

                  {/* Preview table */}
                  {preview && preview.rows.length > 0 && (
                    <div>
                      <p className="field-hint" style={{ marginBottom: '8px' }}>
                        Preview — first {Math.min(PREVIEW_LIMIT, preview.rows.length)} of {preview.rows.length} row(s):
                      </p>
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              {preview.headers.map((h) => (
                                <th key={h}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                              <tr key={i}>
                                {row.map((cell, j) => (
                                  <td key={j}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {preview.rows.length > PREVIEW_LIMIT && (
                        <p className="field-hint" style={{ marginTop: '6px' }}>
                          … and {preview.rows.length - PREVIEW_LIMIT} more row(s) not shown.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="form-actions">
                    <button
                      id="btn-upload-csv"
                      type="submit"
                      className="btn-primary"
                      disabled={!file || uploading}
                    >
                      {uploading
                        ? 'Uploading...'
                        : study.status === 'Generated'
                          ? 'Re-upload and Replace'
                          : 'Upload and Generate Study'}
                    </button>
                    {file && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleReset}
                        disabled={uploading}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* ── Success result card ────────────────────────────── */}
            {result && (
              <div className="setup-card">
                <div className="setup-card__header" style={{ borderLeft: '4px solid #1a6b2a' }}>
                  <span className="setup-badge" style={{ background: '#1a6b2a' }}>Success</span>
                  <h2 style={{ marginTop: '8px' }}>Upload Complete</h2>
                  <p>
                    <strong>{result.inserted_count}</strong> record(s) inserted.{' '}
                    Study status is now{' '}
                    <span className="badge badge--active">{result.study_status}</span>.
                  </p>
                </div>

                <div className="table-scroll table-scroll--bounded" style={{ padding: '16px 20px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Kit Code</th>
                        <th>Site</th>
                        <th>Stratum</th>
                        <th>Intervention</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.records.map((rec) => (
                        <tr key={rec.id}>
                          <td>{rec.sequence_number}</td>
                          <td><code>{rec.kit_code}</code></td>
                          <td>{rec.site_name || '—'}</td>
                          <td>{rec.strata_name || '—'}</td>
                          <td>{rec.treatment_name}</td>
                          <td>
                            <span className="badge badge--inactive">Unassigned</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '0 20px 20px', display: 'flex', gap: '10px' }}>
                  <Link
                    to={`/organizer/studies/${studyId}/home`}
                    className="btn-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    Back to Study
                  </Link>
                  <button
                    id="btn-upload-another"
                    type="button"
                    className="btn-secondary"
                    onClick={handleReset}
                  >
                    Upload New File
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </>
  )
}

export default UploadCSV
