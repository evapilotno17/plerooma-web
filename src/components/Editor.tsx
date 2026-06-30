import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { marked } from 'marked'
import { api, apiURL } from '../api'

const WORDWRAP_KEY = 'plerooma:wordwrap'

function loadWordWrap(): boolean {
  try {
    return localStorage.getItem(WORDWRAP_KEY) === '1'
  } catch {
    return false
  }
}
function saveWordWrap(on: boolean) {
  try {
    localStorage.setItem(WORDWRAP_KEY, on ? '1' : '0')
  } catch {
    // ignore quota / private-mode errors
  }
}

function languageFor(path: string): Extension[] {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'md':
    case 'markdown':
      return [markdown()]
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: ext === 'jsx' || ext === 'tsx', typescript: ext === 'ts' || ext === 'tsx' })]
    case 'json':
      return [json()]
    case 'py':
      return [python()]
    default:
      return []
  }
}

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif',
])

function isImagePath(path: string | null): boolean {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTS.has(ext)
}

function isMarkdownPath(path: string | null): boolean {
  if (!path) return false
  const ext = path.split('.').pop()?.toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

// Default URL builder for image src / direct file fetch — uses the
// admin API. /ani/ passes its own builder pointing at /api/ani/file.
function defaultFileUrl(p: string): string {
  return apiURL('/api/fs/file?path=' + encodeURIComponent(p))
}

export function Editor({
  path,
  onDirtyChange,
  onSaved,
  readOnly = false,
  readFile,
  fileUrl = defaultFileUrl,
  tuiStyle = false,
}: {
  path: string | null
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: () => void
  readOnly?: boolean
  // Optional reader override — e.g. /ani/ uses api.aniReadFile instead
  // of api.readFile so it hits the public endpoint.
  readFile?: (path: string) => Promise<string>
  // URL builder for raw file fetches (image <img src=...>). /ani/ passes
  // a builder pointing at /api/ani/file; admin uses /api/fs/file.
  fileUrl?: (path: string) => string
  // tuiStyle swaps the chrome (header / buttons) for a plain ASCII look.
  // Used on /ani/. In tuiStyle, markdown files default to rendered view.
  tuiStyle?: boolean
}) {
  const [content, setContent] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // showPreview semantics:
  //   admin (tuiStyle=false): false = source-only, true = source + preview split
  //   ani   (tuiStyle=true ): false = source-only, true = preview-only
  const [showPreview, setShowPreview] = useState(false)
  const [wordWrap, setWordWrap] = useState<boolean>(loadWordWrap)
  const contentRef = useRef(content)
  contentRef.current = content

  function toggleWordWrap() {
    setWordWrap((w) => {
      const next = !w
      saveWordWrap(next)
      return next
    })
  }

  const dirty = content !== originalContent
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const isImage = useMemo(() => isImagePath(path), [path])
  const isMarkdown = useMemo(() => isMarkdownPath(path), [path])

  // In /ani/ (tuiStyle), default markdown views to rendered. Reset on
  // every path change so each file opens "rendered first" — and the
  // user can opt into the source view per file.
  useEffect(() => {
    if (tuiStyle) {
      setShowPreview(isMarkdown)
    } else {
      // Admin: keep the user's chosen split state across path changes;
      // don't auto-toggle.
    }
  }, [path, tuiStyle, isMarkdown])

  // Load file when path changes. Skip for images — those render via
  // <img src=fileUrl(path)/> and don't need the text content.
  useEffect(() => {
    if (!path) {
      setContent('')
      setOriginalContent('')
      return
    }
    if (isImagePath(path)) {
      setContent('')
      setOriginalContent('')
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const reader = readFile ?? api.readFile.bind(api)
    reader(path)
      .then((text) => {
        if (cancelled) return
        setContent(text)
        setOriginalContent(text)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'load failed')
        setContent('')
        setOriginalContent('')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, readFile])

  const save = useCallback(async () => {
    if (!path) return
    setSaving(true)
    setError(null)
    try {
      const body = contentRef.current
      await api.writeFile(path, body)
      setOriginalContent(body)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }, [path, onSaved])

  // Cmd+S / Ctrl+S → save. No-op in read-only mode.
  useEffect(() => {
    if (readOnly) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, readOnly])

  const extensions = useMemo(() => {
    const base = path ? languageFor(path) : []
    return wordWrap ? [...base, EditorView.lineWrapping] : base
  }, [path, wordWrap])

  if (!path) {
    if (tuiStyle) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--color-bg)] font-mono text-sm text-[var(--color-text-dim)]">
          [ select a file from the tree ]
        </div>
      )
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        select a file from the tree
      </div>
    )
  }

  // Layout decisions based on file type + mode:
  //  - image: hide source pane, show <img>; no wrap/preview buttons make sense
  //  - markdown + tuiStyle + showPreview: hide source, show preview full-width
  //  - markdown + !tuiStyle + showPreview: show split (source on left, preview right)
  //  - everything else: source only
  const showSourcePane = !isImage && !(tuiStyle && isMarkdown && showPreview)
  const showPreviewPane = !isImage && isMarkdown && showPreview

  const headerClass = tuiStyle
    ? 'flex items-baseline gap-3 border-b border-[var(--color-text-dim)]/30 bg-[var(--color-bg)] px-3 py-1 font-mono text-[13px]'
    : 'flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs'

  return (
    <div className="flex h-full flex-col">
      <div className={headerClass}>
        {tuiStyle ? (
          <>
            <span className="text-[var(--color-text-dim)]">──</span>
            <span className="truncate font-mono text-[var(--color-text)]">{path}</span>
            <span className="text-[var(--color-text-dim)]">──</span>
            {readOnly && (
              <span className="text-[var(--color-text-dim)]">[ ro ]</span>
            )}
            {dirty && !readOnly && (
              <span className="text-[var(--color-accent)]">[ * ]</span>
            )}
            <span className="ml-auto flex items-baseline gap-3">
              {showSourcePane && !isImage && (
                <button
                  onClick={toggleWordWrap}
                  className={`hover:text-[var(--color-text)] ${
                    wordWrap ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
                  }`}
                  title="toggle word wrap"
                >
                  [ wrap{wordWrap ? '*' : ''} ]
                </button>
              )}
              {isMarkdown && (
                <button
                  onClick={() => setShowPreview((s) => !s)}
                  className={`hover:text-[var(--color-text)] ${
                    showPreview ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
                  }`}
                  title={showPreview ? 'show source' : 'show rendered'}
                >
                  {showPreview ? '[ source ]' : '[ rendered ]'}
                </button>
              )}
              {!readOnly && !isImage && (
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="text-[var(--color-accent)] hover:underline disabled:opacity-50"
                  title="⌘S"
                >
                  [ {saving ? 'saving…' : 'save'} ]
                </button>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="truncate font-mono text-[var(--color-text)]">{path}</span>
            {dirty && !readOnly && <span className="text-[var(--color-accent)]">●</span>}
            {readOnly && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">read-only</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              {showSourcePane && !isImage && (
                <button
                  onClick={toggleWordWrap}
                  className={`rounded border border-[var(--color-border)] px-2 py-0.5 hover:text-[var(--color-text)] ${
                    wordWrap ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
                  }`}
                  title="toggle word wrap"
                >
                  wrap
                </button>
              )}
              {isMarkdown && (
                <button
                  onClick={() => setShowPreview((s) => !s)}
                  className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                >
                  {showPreview ? 'hide preview' : 'preview'}
                </button>
              )}
              {!readOnly && !isImage && (
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="rounded bg-[var(--color-accent)] px-2 py-0.5 font-medium text-black disabled:opacity-50"
                  title="⌘S"
                >
                  {saving ? 'saving…' : 'save'}
                </button>
              )}
            </span>
          </>
        )}
      </div>
      {error && <div className="border-b border-[var(--color-border)] bg-[var(--color-danger)]/10 px-3 py-1 text-xs text-[var(--color-danger)]">{error}</div>}
      <div className="flex min-h-0 flex-1">
        {isImage ? (
          <ImageView src={fileUrl(path)} alt={path} />
        ) : (
          <>
            {showSourcePane && (
              <div className={`min-w-0 flex-1 overflow-auto ${showPreviewPane ? 'border-r border-[var(--color-border)]' : ''}`}>
                {loading ? (
                  <div className="p-4 text-sm text-[var(--color-text-dim)]">loading…</div>
                ) : (
                  <CodeMirror
                    value={content}
                    onChange={setContent}
                    extensions={extensions}
                    theme={oneDark}
                    editable={!readOnly}
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLine: true,
                      bracketMatching: true,
                      foldGutter: true,
                    }}
                    height="100%"
                    style={{ height: '100%', fontSize: '13px' }}
                  />
                )}
              </div>
            )}
            {showPreviewPane && (
              <div className="min-w-0 flex-1 overflow-auto p-6 text-[var(--color-text)]">
                <MarkdownPreview source={content} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ImageView({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--color-bg)] p-4">
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        style={{
          imageRendering: 'auto',
          // checkered transparency backdrop for PNGs with alpha
          backgroundImage:
            'linear-gradient(45deg, #1a1e29 25%, transparent 25%), linear-gradient(-45deg, #1a1e29 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1e29 75%), linear-gradient(-45deg, transparent 75%, #1a1e29 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, 10px 0px',
        }}
      />
    </div>
  )
}

// Markdown renderer for the preview pane. Uses `marked` (proper
// CommonMark + GFM) rather than the hand-rolled regex pile that lived
// here before. Styled minimally to match the dark + amber palette.
function MarkdownPreview({ source }: { source: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(source, { async: false, gfm: true, breaks: false }) as string
    } catch {
      return ''
    }
  }, [source])
  return (
    <div
      className="markdown-body"
      style={{ maxWidth: '70ch' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
