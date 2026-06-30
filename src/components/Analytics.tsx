import { useEffect, useState } from 'react'
import { api, type AdminStats } from '../api'

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function Analytics() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [botExpanded, setBotExpanded] = useState(false)

  useEffect(() => {
    api.adminStats()
      .then(setStats)
      .catch((e) => setErr((e as Error).message))
  }, [])

  if (err) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-sm text-[var(--color-danger)]">
        {err}
      </div>
    )
  }
  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-sm text-[var(--color-text-dim)]">
        loading…
      </div>
    )
  }

  const maxHuman = Math.max(1, ...stats.by_day.map((d) => d.human))
  const maxBot   = Math.max(1, ...stats.by_day.map((d) => d.bot))

  const surfaceLabel: Record<string, string> = {
    landing: '/',
    ani: '/ani/',
    public: '/public/',
    admin: '/admin/',
    mcp: '/mcp',
    api: '/api/…',
    other: 'other',
  }

  return (
    <div className="h-full overflow-y-auto p-6 font-mono text-xs text-[var(--color-text)]">

      {/* ── summary ─────────────────────────────────────────── */}
      <section className="mb-8">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
          human visitors
        </p>
        <div className="flex flex-wrap gap-8">
          <Stat label="24 h"       value={stats.summary.human_24h} />
          <Stat label="7 d"        value={stats.summary.human_7d} />
          <Stat label="30 d"       value={stats.summary.human_30d} />
          <Stat label="unique IPs 7d" value={stats.summary.unique_ips_7d} />
        </div>
        <p className="mt-3 text-[var(--color-text-dim)]">
          <span className="text-[var(--color-danger)] opacity-70">{stats.summary.bot_7d.toLocaleString()} bot probes</span>
          <span className="mx-2 opacity-40">·</span>
          <span className="opacity-50">{stats.summary.terminal_7d.toLocaleString()} terminal connections</span>
          <span className="mx-2 opacity-40">—</span>
          <span className="opacity-40">excluded from counts above</span>
        </p>
      </section>

      {/* ── activity chart ──────────────────────────────────── */}
      <section className="mb-8">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
          activity — last 14 days
        </p>
        <div className="border border-[var(--color-border)] p-4">
          {stats.by_day.length === 0 && (
            <p className="text-[var(--color-text-dim)]">no data yet</p>
          )}
          {stats.by_day.map((d) => (
            <div key={d.day} className="mb-2">
              <div className="mb-0.5 flex items-center gap-3">
                <span className="w-24 shrink-0 text-[var(--color-text-dim)]">{d.day}</span>
                <div className="flex-1">
                  <div
                    className="h-2.5 bg-[var(--color-accent)] opacity-80"
                    style={{ width: `${(d.human / maxHuman) * 100}%`, minWidth: d.human > 0 ? '2px' : '0' }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[var(--color-accent)]">{d.human}</span>
              </div>
              {d.bot > 0 && (
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0" />
                  <div className="flex-1">
                    <div
                      className="h-1 opacity-40"
                      style={{
                        width: `${(d.bot / maxBot) * 100}%`,
                        minWidth: '2px',
                        backgroundColor: 'var(--color-danger)',
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right opacity-40 text-[var(--color-danger)]">{d.bot}</span>
                </div>
              )}
            </div>
          ))}
          <div className="mt-3 flex gap-4 text-[10px] text-[var(--color-text-dim)] opacity-60">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 bg-[var(--color-accent)] opacity-80" />
              human
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1 w-3 opacity-40" style={{ backgroundColor: 'var(--color-danger)' }} />
              bot
            </span>
          </div>
        </div>
      </section>

      {/* ── two-column layout ───────────────────────────────── */}
      <div className="flex flex-col gap-8 lg:flex-row">

        {/* surfaces */}
        <section className="lg:w-56 shrink-0">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
            surfaces — 7 d
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
                <th className="pb-1 font-normal">surface</th>
                <th className="pb-1 text-right font-normal">hits</th>
                <th className="pb-1 text-right font-normal">IPs</th>
              </tr>
            </thead>
            <tbody>
              {stats.surfaces.map((s) => (
                <tr key={s.surface} className="border-b border-[var(--color-border)] border-opacity-40">
                  <td className="py-1 pr-3 text-[var(--color-text)]">
                    {surfaceLabel[s.surface] ?? s.surface}
                  </td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-accent)]">{s.hits}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-text-dim)] opacity-60">{s.unique_ips}</td>
                </tr>
              ))}
              {stats.surfaces.length === 0 && (
                <tr><td colSpan={3} className="py-2 text-[var(--color-text-dim)]">no data</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* /ani/ visitors */}
        <section className="flex-1">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
            /ani/ garden visitors — 30 d
          </p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
                <th className="pb-1 font-normal">ip</th>
                <th className="pb-1 font-normal">country</th>
                <th className="pb-1 text-right font-normal">hits</th>
                <th className="pb-1 text-right font-normal">last seen</th>
              </tr>
            </thead>
            <tbody>
              {stats.ani_visitors.map((v) => (
                <tr key={v.ip} className="border-b border-[var(--color-border)] border-opacity-40">
                  <td className="py-1 pr-4 text-[var(--color-text)]">{v.ip}</td>
                  <td className="py-1 pr-4 text-[var(--color-text-dim)]">{v.country}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-accent)]">{v.hits}</td>
                  <td className="py-1 text-right text-[var(--color-text-dim)] opacity-60">{relTime(v.last_seen)}</td>
                </tr>
              ))}
              {stats.ani_visitors.length === 0 && (
                <tr><td colSpan={4} className="py-2 text-[var(--color-text-dim)]">no visitors yet</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* ── top human paths ─────────────────────────────────── */}
      <section className="mt-8">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
          top paths — human, 7 d
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
              <th className="pb-1 font-normal">path</th>
              <th className="pb-1 text-right font-normal">hits</th>
            </tr>
          </thead>
          <tbody>
            {stats.top_human_paths.map((p) => (
              <tr key={p.path} className="border-b border-[var(--color-border)] border-opacity-40">
                <td className="py-1 pr-4 text-[var(--color-text)]">{p.path}</td>
                <td className="py-1 text-right tabular-nums text-[var(--color-accent)]">{p.count}</td>
              </tr>
            ))}
            {stats.top_human_paths.length === 0 && (
              <tr><td colSpan={2} className="py-2 text-[var(--color-text-dim)]">no data</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── bot noise (collapsed) ───────────────────────────── */}
      <section className="mt-8">
        <button
          onClick={() => setBotExpanded((x) => !x)}
          className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          <span>{botExpanded ? '▾' : '▸'}</span>
          <span>bot probes — 7 d ({stats.top_bot_paths.reduce((a, b) => a + b.count, 0)} sampled)</span>
        </button>
        {botExpanded && (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-dim)]">
                <th className="pb-1 font-normal">path</th>
                <th className="pb-1 text-right font-normal">hits</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_bot_paths.map((p) => (
                <tr key={p.path} className="border-b border-[var(--color-border)] border-opacity-40">
                  <td className="py-1 pr-4 opacity-60 text-[var(--color-danger)]">{p.path}</td>
                  <td className="py-1 text-right tabular-nums opacity-60 text-[var(--color-danger)]">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-light tabular-nums text-[var(--color-accent)]">
        {value.toLocaleString()}
      </p>
      <p className="text-[10px] text-[var(--color-text-dim)]">{label}</p>
    </div>
  )
}
