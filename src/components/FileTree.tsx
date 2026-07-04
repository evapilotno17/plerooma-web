import { useCallback, useEffect, useState } from 'react'
import { api, APIError, type FSEntry, type AniEntry } from '../api'

// One tree component, two modes. In admin mode the tree spans the whole
// plerooma; entries are openable and mutation actions (new / delete)
// live under a hover-reveal on each row. In ani mode the tree is rooted
// at users/ani/ and entries carry an `open` flag — closed ones render
// dim and refuse clicks. Mutations are admin-mode only.

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

// CreateKind — what an inline create-input is producing.
type CreateKind = 'file' | 'dir'

// InlineCreate renders an input row where the user types a name for a
// new file or folder. Enter submits, Escape cancels. Blur without a
// value also cancels.
function InlineCreate({
  depth,
  kind,
  onSubmit,
  onCancel,
}: {
  depth: number
  kind: CreateKind
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit() {
    const name = value.trim()
    if (!name) {
      onCancel()
      return
    }
    if (name.includes('/') || name === '.' || name === '..') {
      setError('invalid name')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
      setBusy(false)
      return
    }
    // parent unmounts us on success — no need to reset state
  }

  return (
    <div style={{ paddingLeft: depth * 12 + 8 }} className="py-1">
      <div className="flex items-center gap-1 text-sm">
        <span className="w-3" />
        <span>{kind === 'dir' ? '📁' : '📄'}</span>
        <input
          autoFocus
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          onBlur={() => { if (!value.trim() && !busy) onCancel() }}
          placeholder={kind === 'dir' ? 'new-folder' : 'new-file.md'}
          className="flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-xs text-[var(--color-text)] outline-none"
        />
      </div>
      {error && (
        <div style={{ paddingLeft: 20 }} className="mt-0.5 text-[10px] text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  )
}

// Small text-only pill button for row-level actions.
function RowAction({
  label,
  danger,
  title,
  onClick,
}: {
  label: string
  danger?: boolean
  title?: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      title={title}
      className={`rounded px-1 text-[10px] leading-4 hover:bg-[var(--color-bg-elev-2)] ${
        danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]'
      }`}
    >
      {label}
    </button>
  )
}

type TreeNodeProps = {
  entry: UnifiedEntry
  parentPath: string
  depth: number
  selectedPath: string | null
  onSelect: (path: string | null) => void
  mode: TreeMode
  // Called after a mutation (create/delete) inside this node so the
  // parent can decide whether to refresh (e.g. if a child was deleted
  // and this node is the parent, reload its child list).
  onSiblingChanged?: () => void
}

function TreeNode({ entry, parentPath, depth, selectedPath, onSelect, mode, onSiblingChanged }: TreeNodeProps) {
  const fullPath = joinPath(parentPath, entry.name)
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<UnifiedEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreateKind | null>(null)

  const isDir = entry.type === 'dir'
  const isSelected = selectedPath === fullPath
  const isOpen = entry.open
  const canMutate = mode === 'admin' && isOpen

  const loadChildren = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setChildren(await loadDir(mode, fullPath))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [mode, fullPath])

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
    if (children === null) await loadChildren()
  }

  async function startCreate(kind: CreateKind) {
    // Ensure the folder is expanded and children are loaded so the
    // new inline input appears in-place under existing children.
    if (!expanded) {
      setExpanded(true)
      if (children === null) await loadChildren()
    }
    setCreating(kind)
  }

  async function commitCreate(name: string) {
    const targetPath = joinPath(fullPath, name)
    if (creating === 'file') {
      await api.writeFile(targetPath, '')
    } else {
      await api.mkdir(targetPath)
    }
    setCreating(null)
    await loadChildren()
    if (creating === 'file') onSelect(targetPath)
  }

  async function deleteSelf() {
    const label = isDir ? `folder "${entry.name}" AND ALL ITS CONTENTS` : `"${entry.name}"`
    if (!window.confirm(`delete ${label}?`)) return
    try {
      await api.deleteEntry(fullPath, isDir)
    } catch (e) {
      window.alert(e instanceof APIError ? `delete failed: ${e.message}` : 'delete failed')
      return
    }
    // If the currently-selected path is under (or equal to) what we
    // deleted, clear the selection so the editor doesn't hang on to
    // a stale path.
    if (selectedPath && (selectedPath === fullPath || selectedPath.startsWith(fullPath + '/'))) {
      onSelect(null)
    }
    // Let the parent refresh its listing so this row disappears.
    onSiblingChanged?.()
  }

  const indent = { paddingLeft: depth * 12 + 8 }

  // In ani mode we keep the original color scheme (accent for open,
  // dim for closed). In admin mode we use neutral text and reserve
  // accent for the selection.
  const baseTextColor = isOpen
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text-dim)]'
  const cursor = isOpen ? 'cursor-pointer' : 'cursor-not-allowed'
  const adminColor = 'text-[var(--color-text)]'
  const finalColor = mode === 'ani' ? baseTextColor : adminColor
  const hoverBg = isOpen ? 'hover:bg-[var(--color-bg-elev-2)]' : ''

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-1 px-2 py-1 text-left text-sm ${hoverBg} ${finalColor} ${cursor} ${
          isSelected ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : ''
        }`}
        style={indent}
        onClick={toggle}
      >
        <span className="w-3 text-[var(--color-text-dim)]">
          {isDir ? (expanded ? '▾' : isOpen ? '▸' : '·') : ''}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {isDir ? '📁' : '📄'} {entry.name}
          {mode === 'ani' && !isOpen && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
              private
            </span>
          )}
        </span>
        {canMutate && (
          <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
            {isDir && (
              <>
                <RowAction label="[+f]" title="new file" onClick={() => startCreate('file')} />
                <RowAction label="[+d]" title="new folder" onClick={() => startCreate('dir')} />
              </>
            )}
            <RowAction label="[×]" title={isDir ? 'delete folder' : 'delete file'} danger onClick={deleteSelf} />
          </span>
        )}
      </div>
      {isDir && expanded && isOpen && (
        <div>
          {creating && (
            <InlineCreate
              depth={depth + 1}
              kind={creating}
              onSubmit={commitCreate}
              onCancel={() => setCreating(null)}
            />
          )}
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
              onSiblingChanged={loadChildren}
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
  onSelect: (path: string | null) => void
  reloadKey?: number
  mode?: TreeMode
  rootLabel?: string
}) {
  const [roots, setRoots] = useState<UnifiedEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreateKind | null>(null)

  const loadRoots = useCallback(async () => {
    setError(null)
    try {
      setRoots(await loadDir(mode, ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    }
  }, [mode])

  useEffect(() => {
    setRoots(null)
    loadRoots()
  }, [reloadKey, mode, loadRoots])

  async function commitRootCreate(name: string) {
    if (creating === 'file') {
      await api.writeFile(name, '')
    } else {
      await api.mkdir(name)
    }
    setCreating(null)
    await loadRoots()
    if (creating === 'file') onSelect(name)
  }

  const label = rootLabel ?? (mode === 'ani' ? "ani's garden" : 'plerooma')
  const canMutate = mode === 'admin'

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[var(--color-bg-elev)] font-mono">
      <div className="group flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
        <span>{label}</span>
        {canMutate && (
          <span className="ml-auto hidden items-center gap-0.5 group-hover:flex">
            <RowAction label="[+f]" title="new file at root" onClick={() => setCreating('file')} />
            <RowAction label="[+d]" title="new folder at root" onClick={() => setCreating('dir')} />
          </span>
        )}
      </div>
      {creating && (
        <InlineCreate
          depth={0}
          kind={creating}
          onSubmit={commitRootCreate}
          onCancel={() => setCreating(null)}
        />
      )}
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
          onSiblingChanged={loadRoots}
        />
      ))}
    </div>
  )
}
