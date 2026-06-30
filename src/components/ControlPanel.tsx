import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type FSEntry, type MetaRow, type MetaDetail } from '../api'

// Mirror of server GetVisibility: walk up the path looking for a matching rule.
function effectiveVisibility(path: string, metaMap: Map<string, MetaRow>): 'public' | 'private' {
  const parts = path.split('/')
  for (let depth = 0; depth < parts.length; depth++) {
    const candidate = parts.slice(0, parts.length - depth).join('/')
    const row = metaMap.get(candidate)
    if (row && (depth === 0 || row.recursive)) return row.visibility
  }
  return 'private'
}

type TreeNode = {
  entry: FSEntry
  path: string
  children: TreeNode[] | null  // null = dir not yet loaded
  expanded: boolean
}

function makeNode(entry: FSEntry, parentPath: string): TreeNode {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
  return { entry, path, children: entry.type === 'dir' ? null : [], expanded: false }
}

// Recursively update a node in the tree by path.
function updateNode(
  nodes: TreeNode[],
  path: string,
  fn: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return fn(n)
    if (n.children) return { ...n, children: updateNode(n.children, path, fn) }
    return n
  })
}

// ---- visibility badge -----------------------------------------------

function VisBadge({ vis, explicit }: { vis: 'public' | 'private'; explicit: boolean }) {
  if (vis === 'public') {
    return (
      <span className={`ml-1 text-[10px] text-[var(--color-accent)] ${explicit ? '' : 'opacity-40'}`}>
        {explicit ? '🌐' : '↳🌐'}
      </span>
    )
  }
  return explicit ? (
    <span className="ml-1 text-[10px] text-[var(--color-text-dim)]">🔒</span>
  ) : null
}

// ---- tree item -------------------------------------------------------

function TreeItem({
  node,
  depth,
  metaMap,
  selected,
  onSelect,
  onExpand,
}: {
  node: TreeNode
  depth: number
  metaMap: Map<string, MetaRow>
  selected: string | null
  onSelect: (path: string) => void
  onExpand: (path: string) => void
}) {
  const vis = effectiveVisibility(node.path, metaMap)
  const explicit = metaMap.has(node.path)
  const isDir = node.entry.type === 'dir'
  const isSelected = node.path === selected

  return (
    <div>
      <div
        className={`flex cursor-pointer select-none items-center gap-1 rounded px-1 py-0.5 text-xs ${
          isSelected
            ? 'bg-[var(--color-bg-elev)] text-[var(--color-text)]'
            : 'text-[var(--color-text-dim)] hover:bg-[var(--color-bg-elev)]'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => {
          onSelect(node.path)
          if (isDir) onExpand(node.path)
        }}
      >
        <span className="w-3 shrink-0 text-center text-[var(--color-text-dim)]">
          {isDir ? (node.expanded ? '▾' : '▸') : ''}
        </span>
        <span className={vis === 'public' ? 'text-[var(--color-text)]' : ''}>
          {node.entry.name}{isDir ? '/' : ''}
        </span>
        <VisBadge vis={vis} explicit={explicit} />
      </div>

      {isDir && node.expanded && (
        <div>
          {node.children === null && (
            <div
              className="text-[10px] text-[var(--color-text-dim)] opacity-50"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              loading…
            </div>
          )}
          {node.children?.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              metaMap={metaMap}
              selected={selected}
              onSelect={onSelect}
              onExpand={onExpand}
            />
          ))}
          {node.children?.length === 0 && (
            <div
              className="text-[10px] text-[var(--color-text-dim)] opacity-40"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- detail panel ----------------------------------------------------

function DetailPanel({
  path,
  metaMap,
  refreshKey,
  onSaved,
}: {
  path: string
  metaMap: Map<string, MetaRow>
  refreshKey: number
  onSaved: () => void
}) {
  const [detail, setDetail] = useState<MetaDetail | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [recursive, setRecursive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setMsg(null)
  }, [path])

  useEffect(() => {
    api.getMeta(path).then((d) => {
      setDetail(d)
      const expl = d.entries.find((e) => e.path === d.path)
      setVisibility(expl?.visibility ?? d.effective)
      setRecursive(expl?.recursive ?? false)
    })
  }, [path, refreshKey])

  const explicit = detail?.entries.find((e) => e.path === detail.path) ?? null
  const effectiveVis: 'public' | 'private' = detail?.effective ?? effectiveVisibility(path, metaMap)

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await api.setMeta(path, visibility, recursive)
      setMsg('saved ✓')
      onSaved()
    } catch (e) { setMsg('error: ' + (e as Error).message) }
    finally { setSaving(false) }
  }

  async function clear() {
    setSaving(true); setMsg(null)
    try {
      await api.deleteMeta(path)
      setMsg('rule cleared — inheriting from parent')
      onSaved()
    } catch (e) { setMsg('error: ' + (e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 font-mono text-xs">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">path</p>
        <p className="mt-1 break-all text-[var(--color-text)]">{path}</p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">effective</p>
        <p className={`mt-1 font-medium ${effectiveVis === 'public' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'}`}>
          {effectiveVis === 'public' ? '🌐 public' : '🔒 private'}
          {!explicit && <span className="ml-2 text-[10px] opacity-60">(inherited)</span>}
        </p>
      </div>

      {explicit && (
        <div className="text-[var(--color-text-dim)]">
          <p className="text-[10px] uppercase tracking-widest">explicit rule</p>
          <p className="mt-1">
            set by <span className="text-[var(--color-text)]">{explicit.set_by}</span>
            {explicit.recursive && <span className="ml-2 opacity-60">· recursive</span>}
          </p>
          {explicit.set_at && <p className="opacity-50">{explicit.set_at.slice(0, 10)}</p>}
        </div>
      )}

      <hr className="border-[var(--color-border)]" />

      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">set visibility</p>
          <div className="flex gap-2">
            {(['public', 'private'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`rounded border px-3 py-1 text-xs transition-colors ${
                  visibility === v
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]'
                }`}
              >
                {v === 'public' ? '🌐 public' : '🔒 private'}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[var(--color-text-dim)]">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          recursive — applies to all descendants
        </label>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded border border-[var(--color-accent)] px-3 py-1 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] disabled:opacity-40"
          >
            {saving ? '…' : 'save'}
          </button>
          {explicit && (
            <button
              onClick={clear}
              disabled={saving}
              className="rounded border border-[var(--color-border)] px-3 py-1 text-[var(--color-text-dim)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-40"
            >
              clear rule
            </button>
          )}
        </div>

        {msg && (
          <p className={`text-[10px] ${msg.startsWith('error') ? 'text-[var(--color-danger)]' : 'text-[var(--color-accent)]'}`}>
            {msg}
          </p>
        )}
      </div>

      {detail && detail.entries.filter((e) => e.path !== detail.path).length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">inherited from</p>
          {detail.entries
            .filter((e) => e.path !== detail.path)
            .map((e) => (
              <div key={e.path} className="opacity-70">
                <span className={e.visibility === 'public' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'}>
                  {e.visibility}
                </span>
                {e.recursive && <span className="ml-1 opacity-60">(↓)</span>}
                <span className="ml-2 text-[var(--color-text-dim)]">← {e.path}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ---- main component --------------------------------------------------

const ROOT_DIRS = ['users', 'commons']

export function ControlPanel() {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [metaMap, setMetaMap] = useState<Map<string, MetaRow>>(new Map())
  const [selected, setSelected] = useState<string | null>(null)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const setNodesRef = useRef(setNodes)
  setNodesRef.current = setNodes

  const refreshMeta = useCallback(() => {
    api.listMeta('').then((rows) =>
      setMetaMap(new Map(rows.map((r) => [r.path, r])))
    )
  }, [])

  useEffect(() => {
    refreshMeta()
    Promise.all(
      ROOT_DIRS.map((dir) =>
        api.list(dir)
          .then((res) => res.entries.map((e) => makeNode(e, dir)))
          .catch(() => [] as TreeNode[])
      )
    ).then((groups) => setNodes(groups.flat()))
  }, [refreshMeta])

  const handleExpand = useCallback((path: string) => {
    setNodesRef.current((prev) => {
      // Find the node; if already loaded (children !== null), just toggle.
      const found = findNode(prev, path)
      if (!found) return prev
      const nowExpanded = !found.expanded

      // If expanding and children not yet loaded, fetch them.
      if (nowExpanded && found.children === null) {
        api.list(path)
          .then((res) => {
            const children = res.entries.map((e) => makeNode(e, path))
            setNodesRef.current((p) =>
              updateNode(p, path, (n) => ({ ...n, children }))
            )
          })
          .catch(() => {
            setNodesRef.current((p) =>
              updateNode(p, path, (n) => ({ ...n, children: [] }))
            )
          })
      }

      return updateNode(prev, path, (n) => ({ ...n, expanded: nowExpanded }))
    })
  }, [])

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--color-border)] py-2">
        <p className="mb-2 px-3 text-[10px] uppercase tracking-widest text-[var(--color-text-dim)]">
          plerooma · visibility
        </p>
        {nodes.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            metaMap={metaMap}
            selected={selected}
            onSelect={setSelected}
            onExpand={handleExpand}
          />
        ))}
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <DetailPanel
            key={selected}
            path={selected}
            metaMap={metaMap}
            refreshKey={detailRefreshKey}
            onSaved={() => { refreshMeta(); setDetailRefreshKey((k) => k + 1) }}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-[var(--color-text-dim)]">
            select a file or directory to inspect or edit its visibility
          </div>
        )}
      </div>
    </div>
  )
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const found = findNode(n.children, path)
      if (found) return found
    }
  }
  return null
}
