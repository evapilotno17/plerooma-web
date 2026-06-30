import { useState } from 'react'
import { api, APIError } from '../api'

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.login(password)
      onLoggedIn()
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        setError('wrong password')
      } else {
        setError(err instanceof Error ? err.message : 'login failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg)]">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-8 shadow-2xl"
      >
        <div className="mb-6">
          <div className="text-2xl">🦊</div>
          <h1 className="mt-2 text-xl font-medium text-[var(--color-text)]">
            plerooma
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            a shared garden. sign in.
          </p>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && (
          <div className="mt-3 text-sm text-[var(--color-danger)]">{error}</div>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 w-full rounded bg-[var(--color-accent)] px-3 py-2 font-medium text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? '...' : 'open the garden'}
        </button>
      </form>
    </div>
  )
}
