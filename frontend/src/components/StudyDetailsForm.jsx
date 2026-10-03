import { useState } from 'react'
import { INVESTIGATOR_LABEL_PLURAL } from '../labels'
import {
  BLINDING_TYPE_OPTIONS,
  DEFAULT_BLINDING_TYPE,
  investigatorIsBlinded,
} from '../utils/blindingType'
import {
  buildStudyDetailsPayload,
  criteriaFromStudy,
} from '../utils/studyForm'
import { normalizeIdentifier } from '../utils/normalizeIdentifier'

function StudyDetailsForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Save Changes',
  submitting = false,
  submitDisabled = false,
  error = null,
  successMsg = null,
  cancelLink = null,
}) {
  const initial = defaultValues ?? {}
  const initialCriteria = criteriaFromStudy(initial.inclusionExclusionCriteria)

  const [title, setTitle] = useState(initial.title ?? '')
  const [protocolCode, setProtocolCode] = useState(
    initial.protocolCode ? normalizeIdentifier(initial.protocolCode) : ''
  )
  const [description, setDescription] = useState(initial.description ?? '')
  const [blindingType, setBlindingType] = useState(
    initial.blindingType ?? DEFAULT_BLINDING_TYPE
  )
  const [emergencyUnblinding, setEmergencyUnblinding] = useState(
    initial.emergencyUnblinding ?? true
  )
  const [inclusions, setInclusions] = useState(initialCriteria.inclusions)
  const [exclusions, setExclusions] = useState(initialCriteria.exclusions)

  const showsEmergencyUnblinding = investigatorIsBlinded(blindingType)

  function handleCriteriaChange(type, index, value) {
    const setter = type === 'inclusions' ? setInclusions : setExclusions
    setter((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  function handleAddCriteria(type) {
    const setter = type === 'inclusions' ? setInclusions : setExclusions
    setter((prev) => [...prev, ''])
  }

  function handleRemoveCriteria(type, index) {
    const setter = type === 'inclusions' ? setInclusions : setExclusions
    setter((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await onSubmit(
      buildStudyDetailsPayload({
        title,
        protocolCode,
        description,
        blindingType,
        emergencyUnblinding: showsEmergencyUnblinding ? emergencyUnblinding : true,
        inclusions,
        exclusions,
      })
    )
  }

  return (
    <form className="setup-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="error">{error}</p>}
      {successMsg && <p className="success-msg">{successMsg}</p>}

      <div className="form-grid">
        <div className="field field-full">
          <label htmlFor="study-title">Title / Full Name *</label>
          <input
            id="study-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. A Multi-Center PIB Trial of Drug X"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="protocol-code">Protocol Code *</label>
          <input
            id="protocol-code"
            type="text"
            value={protocolCode}
            onChange={(e) => setProtocolCode(normalizeIdentifier(e.target.value))}
            placeholder="e.g. CT-2026-004"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="blinding-type">Blinding Type</label>
          <select
            id="blinding-type"
            className="select-input"
            value={blindingType}
            onChange={(e) => setBlindingType(Number(e.target.value))}
          >
            {BLINDING_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field field-full">
          <label htmlFor="study-description">Description / Summary</label>
          <textarea
            id="study-description"
            className="textarea-input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of the trial's objective and methodology..."
          />
        </div>

        {showsEmergencyUnblinding && (
          <div className="field field-full field-checkbox">
            <label htmlFor="unblinding-allowed" className="checkbox-label">
              <input
                id="unblinding-allowed"
                type="checkbox"
                checked={emergencyUnblinding}
                onChange={(e) => setEmergencyUnblinding(e.target.checked)}
              />
              <span>Emergency Unblinding Allowed</span>
            </label>
            <span className="field-hint">
              Permits {INVESTIGATOR_LABEL_PLURAL.toLowerCase()} to perform code-breaks in emergency situations.
            </span>
          </div>
        )}
      </div>

      <div className="criteria-section">
        <div className="section-header">
          <h3 className="section-title">Inclusion &amp; Exclusion Criteria</h3>
        </div>
        <p className="field-hint" style={{ marginBottom: '16px' }}>
          Define eligibility criteria for the trial. Hyperlinks are allowed in criterion text.
        </p>

        <div className="criteria-grid">
          <div className="criteria-column">
            <div className="criteria-column__header">
              <h4>Inclusions</h4>
              <button
                type="button"
                className="btn-secondary criteria-btn"
                onClick={() => handleAddCriteria('inclusions')}
                title="Add inclusion criterion"
              >
                + Add
              </button>
            </div>
            <div className="criteria-list">
              {inclusions.map((item, index) => (
                <div key={`inclusion-${index}`} className="criteria-row">
                  <textarea
                    id={`inclusion-${index}`}
                    className="textarea-input criteria-textarea"
                    rows={2}
                    value={item}
                    onChange={(e) =>
                      handleCriteriaChange('inclusions', index, e.target.value)
                    }
                    placeholder={`Inclusion criterion #${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn-danger criteria-btn"
                    onClick={() => handleRemoveCriteria('inclusions', index)}
                    disabled={inclusions.length <= 1}
                    title="Remove inclusion criterion"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="criteria-column">
            <div className="criteria-column__header">
              <h4>Exclusions</h4>
              <button
                type="button"
                className="btn-secondary criteria-btn"
                onClick={() => handleAddCriteria('exclusions')}
                title="Add exclusion criterion"
              >
                + Add
              </button>
            </div>
            <div className="criteria-list">
              {exclusions.map((item, index) => (
                <div key={`exclusion-${index}`} className="criteria-row">
                  <textarea
                    id={`exclusion-${index}`}
                    className="textarea-input criteria-textarea"
                    rows={2}
                    value={item}
                    onChange={(e) =>
                      handleCriteriaChange('exclusions', index, e.target.value)
                    }
                    placeholder={`Exclusion criterion #${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn-danger criteria-btn"
                    onClick={() => handleRemoveCriteria('exclusions', index)}
                    disabled={exclusions.length <= 1}
                    title="Remove exclusion criterion"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: '24px' }}>
        <button type="submit" className="btn-primary" disabled={submitting || submitDisabled}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {cancelLink}
      </div>
    </form>
  )
}

export default StudyDetailsForm
