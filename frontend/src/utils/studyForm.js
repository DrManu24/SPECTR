import { normalizeIdentifier } from './normalizeIdentifier'

export function criteriaFromStudy(criteria) {
  const inclusions =
    criteria?.inclusions?.length > 0 ? [...criteria.inclusions] : ['']
  const exclusions =
    criteria?.exclusions?.length > 0 ? [...criteria.exclusions] : ['']

  return { inclusions, exclusions }
}

export function buildCriteriaPayload(inclusions, exclusions) {
  const trimmedInclusions = inclusions.map((item) => item.trim()).filter(Boolean)
  const trimmedExclusions = exclusions.map((item) => item.trim()).filter(Boolean)

  if (trimmedInclusions.length === 0 && trimmedExclusions.length === 0) {
    return null
  }

  return {
    inclusions: trimmedInclusions,
    exclusions: trimmedExclusions,
  }
}

export function buildStudyDetailsPayload({
  title,
  protocolCode,
  description,
  blindingType,
  emergencyUnblinding,
  inclusions,
  exclusions,
}) {
  return {
    title: title.trim(),
    protocol_code: normalizeIdentifier(protocolCode),
    description: description.trim() || null,
    blinding_type: blindingType,
    emergency_unblinding_allowed: emergencyUnblinding,
    inclusion_exclusion_criteria: buildCriteriaPayload(inclusions, exclusions),
  }
}
