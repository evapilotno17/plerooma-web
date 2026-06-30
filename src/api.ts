// Tiny typed client for the plerooma HTTP API.
//
// In the bundled-with-server deployment (plerooma.com/admin/), all
// requests are same-origin and VITE_API_BASE is unset. The session
// cookie travels automatically.
//
// In a cross-origin deployment (e.g. GitHub Pages → plerooma.com), the
// build sets VITE_API_BASE=https://plerooma.com and every fetch is sent
// with credentials: 'include'. The Go server's CORS middleware echoes
// the origin and allows credentials so the cookie still travels.
//
// The cookie itself is HttpOnly + Secure + SameSite=None in cross-
// origin mode; we never read or set it from JS.

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

// apiURL prepends the configured API base to a relative path. Exported
// so components that build URLs directly (e.g. <img src=...>) can use
// the same scheme as fetch()ed endpoints.
export function apiURL(path: string): string {
  return API_BASE + path
}

// wsURL builds a WebSocket URL. Uses the API base host when set,
// otherwise falls back to same-origin.
export function wsURL(path: string): string {
  if (API_BASE) {
    const u = new URL(API_BASE)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}${path}`
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${path}`
}

export type FSEntry = {
  name: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  size: number
  mtime: number
}

// Tree entry for /ani/ — same shape but with an `open` flag and no mtime
// (the visitor doesn't need timestamps).
export type AniEntry = {
  name: string
  type: 'file' | 'dir'
  open: boolean
  size?: number
}

export type AniCmdResponse = {
  output: string
  cwd: string
  cls?: boolean
  bye?: boolean
}

export type WhoAmI = { caller: string; is_owner: boolean }

export type ExecResponse = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
  timed_out: boolean
}

export type MetaRow = {
  path: string
  visibility: 'public' | 'private'
  recursive: boolean
  set_at: string
  set_by: string
}

export type MetaDetail = {
  path: string
  effective: 'public' | 'private'
  entries: MetaRow[]
}

export type AdminStats = {
  summary: {
    human_24h: number
    human_7d: number
    human_30d: number
    bot_7d: number
    terminal_7d: number
    unique_ips_7d: number
  }
  by_day: Array<{ day: string; human: number; bot: number }>
  surfaces: Array<{ surface: string; hits: number; unique_ips: number }>
  ani_visitors: Array<{ ip: string; country: string; hits: number; last_seen: string }>
  top_human_paths: Array<{ path: string; count: number }>
  top_bot_paths: Array<{ path: string; count: number }>
}

class APIError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new APIError(r.status, txt || r.statusText)
  }
  return r.json() as Promise<T>
}

export const api = {
  async login(password: string): Promise<{ ok: boolean; expires: number }> {
    const r = await fetch(apiURL('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include',
    })
    return jsonOrThrow(r)
  },

  async logout(): Promise<{ ok: boolean }> {
    const r = await fetch(apiURL('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include',
    })
    return jsonOrThrow(r)
  },

  async whoami(): Promise<WhoAmI> {
    const r = await fetch(apiURL('/api/auth/whoami'), { credentials: 'include' })
    return jsonOrThrow(r)
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    const r = await fetch(apiURL('/api/auth/change-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      credentials: 'include',
    })
    return jsonOrThrow(r)
  },

  async list(path: string): Promise<{ path: string; entries: FSEntry[] }> {
    const url = apiURL('/api/fs/list?path=' + encodeURIComponent(path))
    const r = await fetch(url, { credentials: 'include' })
    return jsonOrThrow(r)
  },

  async readFile(path: string): Promise<string> {
    const url = apiURL('/api/fs/file?path=' + encodeURIComponent(path))
    const r = await fetch(url, { credentials: 'include' })
    if (!r.ok) {
      throw new APIError(r.status, await r.text().catch(() => r.statusText))
    }
    return r.text()
  },

  async writeFile(path: string, content: string): Promise<{ ok: boolean; bytes: number }> {
    const url = apiURL('/api/fs/file?path=' + encodeURIComponent(path))
    const r = await fetch(url, {
      method: 'PUT',
      body: content,
      credentials: 'include',
    })
    return jsonOrThrow(r)
  },

  async exec(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecResponse> {
    const r = await fetch(apiURL('/api/exec'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd,
        cwd: opts?.cwd,
        timeout_ms: opts?.timeoutMs,
      }),
      credentials: 'include',
    })
    return jsonOrThrow(r)
  },

  ptyURL(): string {
    // The WebSocket carries the cookie automatically (same-origin or
    // cross-origin via SameSite=None).
    return wsURL('/api/exec/pty')
  },

  async adminStats(): Promise<AdminStats> {
    const r = await fetch(apiURL('/api/admin/stats'), { credentials: 'include' })
    return jsonOrThrow(r)
  },

  async listMeta(prefix = ''): Promise<MetaRow[]> {
    const url = apiURL('/api/admin/meta/list' + (prefix ? '?prefix=' + encodeURIComponent(prefix) : ''))
    const r = await fetch(url, { credentials: 'include' })
    const data = await jsonOrThrow<{ entries: MetaRow[] }>(r)
    return data.entries
  },

  async getMeta(path: string): Promise<MetaDetail> {
    const r = await fetch(apiURL('/api/admin/meta?path=' + encodeURIComponent(path)), { credentials: 'include' })
    return jsonOrThrow(r)
  },

  async setMeta(path: string, visibility: 'public' | 'private', recursive: boolean): Promise<void> {
    const r = await fetch(apiURL('/api/admin/meta'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, visibility, recursive }),
      credentials: 'include',
    })
    await jsonOrThrow(r)
  },

  async deleteMeta(path: string): Promise<void> {
    const r = await fetch(apiURL('/api/admin/meta?path=' + encodeURIComponent(path)), {
      method: 'DELETE',
      credentials: 'include',
    })
    await jsonOrThrow(r)
  },

  // ---- /ani/ public-view (no auth) ------------------------------------

  async aniTree(path: string): Promise<{ path: string; entries: AniEntry[] }> {
    const r = await fetch(apiURL('/api/ani/tree?path=' + encodeURIComponent(path)))
    return jsonOrThrow(r)
  },

  async aniReadFile(path: string): Promise<string> {
    const r = await fetch(apiURL('/api/ani/file?path=' + encodeURIComponent(path)))
    if (!r.ok) {
      throw new APIError(r.status, await r.text().catch(() => r.statusText))
    }
    return r.text()
  },

  async aniCmd(cmd: string, cwd: string): Promise<AniCmdResponse> {
    const r = await fetch(apiURL('/api/ani/cmd'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd, cwd }),
    })
    return jsonOrThrow(r)
  },
}

export { APIError }
