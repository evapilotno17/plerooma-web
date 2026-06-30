import { useState } from 'react'
import { api, APIError } from '../api'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

const MIN_LEN = 8

export function Settings() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const tooShort = next.length > 0 && next.length < MIN_LEN
  const mismatch = confirm.length > 0 && confirm !== next
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_LEN &&
    confirm === next &&
    status.kind !== 'submitting'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setStatus({ kind: 'submitting' })
    try {
      await api.changePassword(current, next)
      setStatus({ kind: 'success' })
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      let message = 'change failed'
      if (err instanceof APIError) {
        if (err.status === 401) message = 'current password incorrect'
        else if (err.status === 403) message = 'owner only — log in with the cookie session'
        else if (err.message) message = err.message
      } else if (err instanceof Error) {
        message = err.message
      }
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] p-6">
      <div className="mx-auto max-w-md">
        <h2 className="text-lg font-medium text-[var(--color-text)]">settings</h2>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          owner-only · changes take effect immediately
        </p>

        <form
          onSubmit={submit}
          className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6"
        >
          <h3 className="text-sm font-medium text-[var(--color-text)]">
            change owner password
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            other sessions on this account will be signed out.
          </p>

          <PasswordField
            label="current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />

          <PasswordField
            label="new password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            hint={tooShort ? `min ${MIN_LEN} characters` : undefined}
            hintIsError={tooShort}
          />

          <PasswordField
            label="confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            hint={mismatch ? 'does not match' : undefined}
            hintIsError={mismatch}
          />

          {status.kind === 'error' && (
            <div className="mt-3 text-sm text-[var(--color-danger)]">
              {status.message}
            </div>
          )}
          {status.kind === 'success' && (
            <div className="mt-3 text-sm text-[var(--color-accent)]">
              password updated.
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 w-full rounded bg-[var(--color-accent)] px-3 py-2 font-medium text-black transition hover:brightness-110 disabled:opacity-50"
          >
            {status.kind === 'submitting' ? '...' : 'update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  hintIsError = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  hint?: string
  hintIsError?: boolean
}) {
  return (
    <label className="mt-4 block">
      <span className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
      />
      {hint && (
        <span
          className={`mt-1 block text-xs ${
            hintIsError ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-dim)]'
          }`}
        >
          {hint}
        </span>
      )}
    </label>
  )
}
