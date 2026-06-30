import { useEffect, useState } from 'react'
import { api, type AniEntry } from '../api'

// A plain-text file tree for /ani/. No icons, no rounded borders, no
// hover backgrounds — just monospace text with amber for openable
// entries and dim for closed ones. Click an [+]/[-] dir to toggle;
// click a file to open it.

type TreeNodeProps = {
  entry: AniEntry
  parentPath: string
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}

function joinPath(parent: string, child: string): string {
  if (!parent) return child
  return parent + '/' + child
}

const INDENT = 2 // visual columns per depth level
const SPACE = ' ' // nbsp — preserves indentation through whitespace collapse

function TreeNode({
  entry,
  parentPath,
  depth,
  selectedPath,
  onSelect,
}: TreeNodeProps) {
  const fullPath = joinPath(parentPath, entry.name)
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<AniEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDir = entry.type === 'dir'
  const isSelected = selectedPath === fullPath
  const isOpen = entry.open

  async function toggle() {
    if (!isOpen) return
    if (!isDir) {
      onSelect(fullPath)
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (children === null) {
      setLoading(true)
      try {
        const res = await api.aniTree(fullPath)
        setChildren(res.entries)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        setLoading(false)
      }
    }
  }

  const pad = SPACE.repeat(depth * INDENT)
  const indicator = isDir ? (expanded ? '[-]' : '[+]') : '   '
  const colorClass = isOpen
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text-dim)]'
  const cursor = isOpen ? 'cursor-pointer' : 'cursor-not-allowed'
  const hover = isOpen ? 'hover:bg-[var(--color-bg-elev-2)]' : ''
  const selectedBg = isSelected ? 'bg-[var(--color-accent-soft)]' : ''

  // Append "/" to directory names; "(private)" suffix to closed entries.
  const name = isDir ? entry.name + '/' : entry.name
  const suffix = isOpen ? '' : SPACE + SPACE + '(private)'

  return (
    <>
      <div
        onClick={toggle}
        className={`whitespace-pre ${colorClass} ${cursor} ${hover} ${selectedBg}`}
        title={isOpen ? '' : 'private'}
      >
        {pad}
        <span className="text-[var(--color-text-dim)]">{indicator}</span>
        {SPACE}
        {name}
        <span className="text-[var(--color-text-dim)]">{suffix}</span>
      </div>
      {isDir && expanded && isOpen && (
        <>
          {loading && (
            <div className="whitespace-pre text-[var(--color-text-dim)]">
              {SPACE.repeat((depth + 1) * INDENT)}loading…
            </div>
          )}
          {error && (
            <div className="whitespace-pre text-[var(--color-danger)]">
              {SPACE.repeat((depth + 1) * INDENT)}
              {error}
            </div>
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  )
}

export function AsciiFileTree({
  selectedPath,
  onSelect,
}: {
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const [roots, setRoots] = useState<AniEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRoots(null)
    setError(null)
    api
      .aniTree('')
      .then((r) => setRoots(r.entries))
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg)] font-mono text-[13px] leading-[1.5]">
      <div className="border-b border-[var(--color-text-dim)]/30 px-3 py-1 text-[var(--color-text-dim)]">
        ── ani/ ─────────────────
      </div>
      <div className="px-3 py-1">
        {error && <div className="text-[var(--color-danger)]">{error}</div>}
        {roots === null && !error && (
          <div className="text-[var(--color-text-dim)]">loading…</div>
        )}
        {roots?.map((entry) => (
          <TreeNode
            key={entry.name}
            entry={entry}
            parentPath=""
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
