import { useEffect, useState } from 'react'
import { api, type FSEntry, type AniEntry } from '../api'

// One tree component, two modes. In admin mode the tree spans the whole
// plerooma and every entry is openable. In ani mode the tree is rooted
// at users/ani/ and entries carry an `open` flag — closed ones render
// dim/white and refuse clicks.

export type TreeMode = 'admin' | 'ani'

// UnifiedEntry is the in-component shape we render regardless of mode.
type UnifiedEntry = {
  name: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  open: boolean
}

function adaptAdmin(e: FSEntry): UnifiedEntry {
  return { name: e.name, type: e.type, open: true }
}
function adaptAni(e: AniEntry): UnifiedEntry {
  return { name: e.name, type: e.type, open: e.open }
}

async function loadDir(mode: TreeMode, path: string): Promise<UnifiedEntry[]> {
  if (mode === 'ani') {
    const res = await api.aniTree(path === '' ? '' : path)
    return res.entries.map(adaptAni)
  }
  const res = await api.list(path)
  return res.entries.map(adaptAdmin)
}

function joinPath(parent: string, child: string): string {
  if (!parent) return child
  return parent + '/' + child
}

type TreeNodeProps = {
  entry: UnifiedEntry
  parentPath: string
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
  mode: TreeMode
}

function TreeNode({ entry, parentPath, depth, selectedPath, onSelect, mode }: TreeNodeProps) {
  const fullPath = joinPath(parentPath, entry.name)
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<UnifiedEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDir = entry.type === 'dir'
  const isSelected = selectedPath === fullPath
  const isOpen = entry.open

  async function toggle() {
    if (!isOpen) return // closed entries are inert
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
        setChildren(await loadDir(mode, fullPath))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        setLoading(false)
      }
    }
  }

  const indent = { paddingLeft: depth * 12 + 8 }

  // Color: open = accent on hover/select; closed = dim, no-cursor.
  // In admin mode everything is open, so this collapses to the previous
  // appearance.
  const baseTextColor = isOpen
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text-dim)]'
  const cursor = isOpen ? 'cursor-pointer' : 'cursor-not-allowed'
  // In admin mode we keep the original neutral white tree colour — the
  // accent there is reserved for the selection.
  const adminColor = 'text-[var(--color-text)]'
  const finalColor = mode === 'ani' ? baseTextColor : adminColor
  const hoverBg = isOpen ? 'hover:bg-[var(--color-bg-elev-2)]' : ''

  return (
    <div>
      <button
        onClick={toggle}
        disabled={!isOpen}
        title={isOpen ? '' : 'private'}
        className={`flex w-full items-center gap-1 px-2 py-1 text-left text-sm ${hoverBg} ${finalColor} ${cursor} ${
          isSelected ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : ''
        }`}
        style={indent}
      >
        <span className="w-3 text-[var(--color-text-dim)]">
          {isDir ? (expanded ? '▾' : isOpen ? '▸' : '·') : ''}
        </span>
        <span className="truncate">
          {isDir ? '📁' : '📄'} {entry.name}
          {mode === 'ani' && !isOpen && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
              private
            </span>
          )}
        </span>
      </button>
      {isDir && expanded && isOpen && (
        <div>
          {loading && (
            <div style={{ paddingLeft: (depth + 1) * 12 + 8 }} className="py-1 text-xs text-[var(--color-text-dim)]">
              loading…
            </div>
          )}
          {error && (
            <div style={{ paddingLeft: (depth + 1) * 12 + 8 }} className="py-1 text-xs text-[var(--color-danger)]">
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
              mode={mode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({
  selectedPath,
  onSelect,
  reloadKey,
  mode = 'admin',
  rootLabel,
}: {
  selectedPath: string | null
  onSelect: (path: string) => void
  reloadKey?: number
  mode?: TreeMode
  rootLabel?: string
}) {
  const [roots, setRoots] = useState<UnifiedEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRoots(null)
    setError(null)
    loadDir(mode, '')
      .then(setRoots)
      .catch((e) => setError(e instanceof Error ? e.message : 'load failed'))
  }, [reloadKey, mode])

  const label = rootLabel ?? (mode === 'ani' ? "ani's garden" : 'plerooma')

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[var(--color-bg-elev)] font-mono">
      <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </div>
      {error && <div className="px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
      {roots === null && !error && (
        <div className="px-3 py-2 text-sm text-[var(--color-text-dim)]">loading…</div>
      )}
      {roots?.map((entry) => (
        <TreeNode
          key={entry.name}
          entry={entry}
          parentPath=""
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          mode={mode}
        />
      ))}
    </div>
  )
}
