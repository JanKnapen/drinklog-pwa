let accessToken: string | null = null

export function setAccessToken(token: string): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const data = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    if (!data.ok) return false
    const json = await data.json()
    setAccessToken(json.access_token)
    return true
  } catch {
    return false
  }
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

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(url, init)

  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const retry = await fetchWithAuth(url, init)
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({ detail: retry.statusText }))
        throw new ApiError(retry.status, body.detail ?? retry.statusText)
      }
      if (retry.status === 204) return undefined as T
      return retry.json()
    }
    clearAccessToken()
    throw new AuthError()
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return fetch(url, { ...init, headers: { ...headers, ...init?.headers }, credentials: 'include' })
}
