import { API_URL } from './config'

const CSRF_STORAGE_KEY = 'csrf_token'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Paths the backend exempts from CSRF — mirror the server-side list so we
// don't throw a CsrfError before the request even leaves the browser.
const CSRF_EXEMPT_PATHS = new Set([
  '/setup',
  '/setup/status',
  '/csrf',
  '/admin/login',
  '/organizer/login',
  '/investigator/login',
])

const SESSION_INVALID_MESSAGE =
  'Your session is no longer valid. Please refresh the page and sign in again.'

export class CsrfError extends Error {
  constructor(message = SESSION_INVALID_MESSAGE) {
    super(message)
    this.name = 'CsrfError'
  }
}

/** Normalize FastAPI error bodies (string detail or 422 validation array). */
export function parseApiError(detail) {
  if (typeof detail === 'string') {
    if (detail === 'CSRF validation failed.') return SESSION_INVALID_MESSAGE
    return detail
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || item).join(', ')
  }
  return null
}

export function setCsrfToken(token) {
  if (token) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token)
  }
}

export function clearCsrfToken() {
  sessionStorage.removeItem(CSRF_STORAGE_KEY)
}

export function storeCsrfFromResponse(data) {
  if (data?.csrf_token) setCsrfToken(data.csrf_token)
}

/** Fetch a CSRF cookie/token for unauthenticated pages (login, forgot-password). */
export async function bootstrapCsrf() {
  const res = await fetch(`${API_URL}/csrf`, { credentials: 'include' })
  if (!res.ok) return ''
  const data = await res.json()
  storeCsrfFromResponse(data)
  return data.csrf_token || ''
}

/** POST logout; clears CSRF only when the server confirms logout. */
export async function apiLogout(path) {
  const res = await apiFetch(path, { method: 'POST' })
  if (res.ok) {
    clearCsrfToken()
  }
  return res.ok
}

function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function getCsrfToken() {
  // Prefer the cookie — it is shared across tabs (same-origin deploy).
  const fromCookie = readCsrfCookie()
  if (fromCookie) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, fromCookie)
    return fromCookie
  }

  // Fallback when the cookie is not readable (e.g. cross-origin local dev).
  return sessionStorage.getItem(CSRF_STORAGE_KEY) || ''
}

function mePathForApiPath(path) {
  if (path.startsWith('/organizer')) return '/organizer/me'
  if (path.startsWith('/admin')) return '/admin/me'
  if (path.startsWith('/investigator')) return '/investigator/me'
  return null
}

/** Fetch a fresh CSRF token when neither cookie nor sessionStorage has one. */
async function bootstrapCsrfIfNeeded(apiPath) {
  const existing = getCsrfToken()
  if (existing) return existing

  const mePath = mePathForApiPath(apiPath)
  if (mePath) {
    const res = await fetch(`${API_URL}${mePath}`, { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      storeCsrfFromResponse(data)
      return data.csrf_token || ''
    }
  }

  return bootstrapCsrf()
}

async function requireCsrfToken(apiPath) {
  const csrf = await bootstrapCsrfIfNeeded(apiPath)
  if (!csrf) {
    throw new CsrfError()
  }
  return csrf
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})

  if (UNSAFE_METHODS.has(method)) {
    if (CSRF_EXEMPT_PATHS.has(path)) {
      // Backend doesn't require CSRF for this path — send token if we have one, but don't throw if not.
      const csrf = getCsrfToken()
      if (csrf) headers.set('X-CSRF-Token', csrf)
    } else {
      const csrf = await requireCsrfToken(path)
      headers.set('X-CSRF-Token', csrf)
    }
  }

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    options.body = JSON.stringify(options.json)
    delete options.json
  }

  if (options.setupToken) {
    headers.set('X-Setup-Token', options.setupToken)
    delete options.setupToken
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })
}

/** POST multipart/form-data (e.g. file upload). Do not set Content-Type manually. */
export async function apiUpload(path, formData) {
  const headers = new Headers()
  const csrf = await requireCsrfToken(path)
  headers.set('X-CSRF-Token', csrf)

  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  })
}
