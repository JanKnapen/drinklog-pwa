import { useState } from 'react'
import { Field, inputCls, primaryBtn } from './FormFields'
import { apiFetch, setAccessToken } from '../api/client'

interface Props {
  onLogin: (username: string) => void
}

export default function LoginView({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch<{ access_token: string; username: string }>(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ username, password }) }
      )
      setAccessToken(data.access_token)
      onLogin(data.username)
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center px-6 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6 text-center">DrinkLog</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Username">
            <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading || !username || !password} className={primaryBtn}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
