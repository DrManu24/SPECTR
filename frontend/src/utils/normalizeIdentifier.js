/** Uppercase identifier with all whitespace removed (leading, trailing, and internal). */
export function normalizeIdentifier(value) {
  return String(value).replace(/\s+/g, '').toUpperCase()
}
