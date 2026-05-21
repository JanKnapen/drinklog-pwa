import { enqueueMutation, listMutations, removeMutation } from './offline-queue'

let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const data = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      if (!data.ok) return false
      const json = await data.json()
      setAccessToken(json.access_token)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail)
  }
}

export class AuthError extends Error {
  constructor() {
    super('Session expired')
  }
}

export class OfflineQueuedError extends Error {
  constructor() {
    super('Saved offline — will sync when online')
  }
}

const QUEUEABLE = new Set([
  'POST /api/alcohol-entries',
  'POST /api/caffeine-entries',
])

function isQueueable(url: string, method: string): boolean {
  const path = url.split('?')[0]
  return QUEUEABLE.has(`${method.toUpperCase()} ${path}`)
}

const QUEUEABLE_TIMEOUT_MS = 5000

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const queueable = isQueueable(url, method) && typeof init?.body === 'string'

  if (queueable) {
    console.info('[offline-queue] apiFetch', method, url, 'navigator.onLine=', navigator.onLine)
  }

  // Fast path: when the browser already knows we're offline, skip the fetch and queue
  // immediately. Without this, iOS Safari (and some Chromium configurations) hang on
  // fetch for ~5-15 s before throwing, so handleNetworkFailure runs too late — the click
  // handler is stuck waiting on a promise that won't reject until the OS gives up.
  if (!navigator.onLine && queueable) {
    await enqueueMutation({ url, method, body: init!.body as string })
    console.info('[offline-queue] queued (offline precheck)', method, url)
    throw new OfflineQueuedError()
  }

  // Bounded fetch for queueable POSTs — abort and queue after QUEUEABLE_TIMEOUT_MS.
  // Catches the case where navigator.onLine reports true but fetch actually hangs
  // (iOS Safari OS network-timeout, throttled connections, captive portals, etc.).
  let initToSend = init
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  if (queueable) {
    const controller = new AbortController()
    timeoutId = setTimeout(() => {
      console.info('[offline-queue] fetch timeout, aborting', method, url)
      controller.abort()
    }, QUEUEABLE_TIMEOUT_MS)
    initToSend = { ...init, signal: controller.signal }
  }

  let res: Response
  try {
    res = await fetchWithAuth(url, initToSend)
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    return handleNetworkFailure<T>(err, url, init)
  }
  if (timeoutId) clearTimeout(timeoutId)

  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      let retry: Response
      try {
        retry = await fetchWithAuth(url, init)
      } catch (err) {
        return handleNetworkFailure<T>(err, url, init)
      }
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({ detail: retry.statusText }))
        throw new ApiError(retry.status, body.detail ?? retry.statusText)
      }
      if (retry.status === 204) return undefined as T
      return retry.json()
    }
    clearAccessToken()
    window.location.reload()
    throw new AuthError()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

async function handleNetworkFailure<T>(err: unknown, url: string, init?: RequestInit): Promise<T> {
  // Reached here only when fetch itself threw (no Response). Origin can be a TypeError
  // from the browser (offline / DNS / connection refused) or a WorkboxError when the
  // service worker's NetworkFirst handler bails on a POST while offline. In both cases
  // we have no server response, so queueing the request for later replay is correct.
  const method = (init?.method ?? 'GET').toUpperCase()
  if (isQueueable(url, method) && typeof init?.body === 'string') {
    await enqueueMutation({ url, method, body: init.body })
    console.info('[offline-queue] queued', method, url)
    throw new OfflineQueuedError()
  }
  console.warn('[offline-queue] network failure not queued', method, url, err)
  throw err
}

function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return fetch(url, { ...init, headers: { ...headers, ...init?.headers }, credentials: 'include' })
}

export interface DrainResult {
  drained: number
  failed: number
  remaining: number
}

export async function drainOfflineQueue(): Promise<DrainResult> {
  const pending = await listMutations()
  let drained = 0
  let failed = 0

  for (const m of pending) {
    let res: Response
    try {
      res = await replayRequest(m.url, m.method, m.body)
    } catch {
      return { drained, failed, remaining: pending.length - drained - failed }
    }

    if (res.status === 401) {
      const refreshed = await refreshAccessToken()
      if (!refreshed) return { drained, failed, remaining: pending.length - drained - failed }
      try {
        res = await replayRequest(m.url, m.method, m.body)
      } catch {
        return { drained, failed, remaining: pending.length - drained - failed }
      }
    }

    if (res.ok || (res.status >= 400 && res.status < 500)) {
      await removeMutation(m.id)
      if (res.ok) drained++
      else failed++
    } else {
      return { drained, failed, remaining: pending.length - drained - failed }
    }
  }

  return { drained, failed, remaining: 0 }
}

function replayRequest(url: string, method: string, body: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return fetch(url, { method, headers, body, credentials: 'include' })
}
