import { useState, useEffect } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { apiFetch, storeCsrfFromResponse, parseApiError } from '../api'
import Header from '../components/Header'
import StudyDetailsForm from '../components/StudyDetailsForm'

function studyLimitMessage(org) {
  const limit = org.study_limit ?? 0
  const created = org.studies_created ?? 0
  if (limit <= 0 && created <= 0) {
    return 'Your account has no study allowance configured yet. Contact administrator before creating a study.'
  }
  const limitWord = limit === 1 ? 'study' : 'studies'
  return `You have used all ${limit} ${limitWord} allowed on your account (${created} created). Contact administrator to request a higher limit.`
}

function CreateStudy() {
  const { studyId } = useParams()
  const isEditMode = Boolean(studyId)
  const navigate = useNavigate()
  const [organizer, setOrganizer] = useState(null)
  const [study, setStudy] = useState(null)
  const [loadingStudy, setLoadingStudy] = useState(isEditMode)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiFetch('/organizer/me')
      .then((res) => {
        if (!res.ok) {
          navigate('/organizer/login', { replace: true })
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          storeCsrfFromResponse(data)
          setOrganizer(data)
        }
      })
      .catch(() => navigate('/organizer/login', { replace: true }))
  }, [navigate])

  useEffect(() => {
    if (!isEditMode) return

    setLoadingStudy(true)
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
      .finally(() => setLoadingStudy(false))
  }, [isEditMode, studyId, navigate])

  const atStudyLimit =
    !isEditMode &&
    organizer != null &&
    (organizer.studies_remaining ?? 0) <= 0

  async function handleSubmit(payload) {
    setError(null)

    if (
      !isEditMode &&
      organizer != null &&
      (organizer.studies_remaining ?? 0) <= 0
    ) {
      setError(studyLimitMessage(organizer))
      return
    }

    setSubmitting(true)

    try {
      const res = await apiFetch(
        isEditMode ? `/organizer/studies/${studyId}` : '/organizer/studies/',
        {
          method: isEditMode ? 'PATCH' : 'POST',
          json: payload,
        }
      )
      const data = await res.json()

      if (!res.ok) {
        const message =
          parseApiError(data.detail) ||
          (res.status === 409
            ? `A study with protocol code "${payload.protocol_code}" already exists. Please use a different protocol code.`
            : isEditMode
              ? 'Failed to save study.'
              : 'Failed to create study.')

        if (res.status === 409) {
          document.getElementById('protocol-code')?.focus()
        }

        setError(message)
        return
      }

      navigate(`/organizer/studies/${data.id}/home`, {
        state: {
          successMsg: isEditMode
            ? `Study "${data.title}" updated successfully.`
            : `Study "${data.title}" created successfully.`,
        },
      })
    } catch {
      setError('Could not connect to backend.')
    } finally {
      setSubmitting(false)
    }
  }

  const backLink = isEditMode
    ? `/organizer/studies/${studyId}/home`
    : '/organizer/home'

  const pageTitle = isEditMode ? 'Edit Study' : 'Create New Study'
  const isLoading = !organizer || (isEditMode && loadingStudy)

  return (
    <>
      <Header />

      <main className="app">
        <div className="page-header">
          <Link to={backLink} className="back-link">
            {isEditMode ? '← Back to Study' : '← Back to Studies'}
          </Link>
          <h1>{pageTitle}</h1>
        </div>

        {isLoading ? (
          <p className="loading">{isEditMode ? 'Loading study…' : 'Verifying session…'}</p>
        ) : (
          <div className="study-form-stack">
            {atStudyLimit && (
              <div
                className="pb-blinding-warning"
                role="alert"
                style={{ marginBottom: '12px', textAlign: 'left' }}
              >
                <strong>Study creation quota reached.</strong> {studyLimitMessage(organizer)}
              </div>
            )}

            <div className="study-form-card">
            <div className="setup-card__header">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="setup-badge">Study Configuration</span>
                {isEditMode ? (
                  <span className={`badge badge--${study.status === 'Draft' ? 'inactive' : 'active'}`}>
                    Status: {study.status}
                  </span>
                ) : (
                  <span className="badge badge--inactive">Status: Draft</span>
                )}
              </div>
              <h2 style={{ marginTop: '8px' }}>Trial Metadata &amp; Protocol Settings</h2>
              <p>
                {isEditMode
                  ? 'Update basic trial information. Protocol code must be unique across all studies.'
                  : 'Configure basic trial information. You can add intervention arms and randomization settings after creation.'}
              </p>
            </div>

            <StudyDetailsForm
              key={isEditMode ? `${study.id}-${study.updated_at}` : 'create'}
              defaultValues={
                isEditMode
                  ? {
                      title: study.title,
                      protocolCode: study.protocol_code,
                      description: study.description ?? '',
                      blindingType: study.blinding_type,
                      emergencyUnblinding: study.emergency_unblinding_allowed,
                      inclusionExclusionCriteria: study.inclusion_exclusion_criteria,
                    }
                  : undefined
              }
              onSubmit={handleSubmit}
              submitLabel={isEditMode ? 'Save Changes' : 'Create Study'}
              submitting={submitting}
              submitDisabled={atStudyLimit}
              error={error}
              cancelLink={
                <Link
                  to={backLink}
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  Cancel
                </Link>
              }
            />
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export default CreateStudy
