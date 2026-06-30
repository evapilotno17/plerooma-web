import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { api, type WhoAmI, APIError } from './api'
import { LoginScreen } from './components/LoginScreen'
import { FileTree } from './components/FileTree'
import { Editor } from './components/Editor'
import { Terminal } from './components/Terminal'
import { Analytics } from './components/Analytics'
import { ControlPanel } from './components/ControlPanel'

type View = 'editor' | 'control-panel' | 'analytics'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'logged-in'; me: WhoAmI }

const PANEL_STORAGE_KEY = 'plerooma:panels'

const VIEW_PATHS: Record<View, string> = {
  'editor':        '/admin/editor',
  'control-panel': '/admin/visibility',
  'analytics':     '/admin/analytics',
}

function viewFromPath(): View {
  const p = window.location.pathname
  if (p.startsWith('/admin/visibility')) return 'control-panel'
  if (p.startsWith('/admin/analytics'))  return 'analytics'
  return 'editor'
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function AdminApp() {
  const [auth, setAuth] = useState<AuthState>({ kind: 'loading' })
  const [view, setView] = useState<View>(viewFromPath)

  // Sync view ↔ URL
  useEffect(() => {
    const handler = () => setView(viewFromPath())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  function switchView(v: View) {
    history.pushState(null, '', VIEW_PATHS[v])
    setView(v)
  }
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalKey, setTerminalKey] = useState(0)
  const isMobile = useIsMobile()

  useEffect(() => {
    api
      .whoami()
      .then((me) => setAuth({ kind: 'logged-in', me }))
      .catch((e) => {
        if (e instanceof APIError && e.status === 401) {
          setAuth({ kind: 'anon' })
        } else {
          setAuth({ kind: 'anon' })
        }
      })
  }, [])

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  async function logout() {
    if (dirty && !confirm('unsaved changes — log out anyway?')) return
    try {
      await api.logout()
    } catch {
      // ignore
    }
    setAuth({ kind: 'anon' })
    setSelectedPath(null)
  }

  async function newSession() {
    try {
      await api.exec('tmux kill-session -t plerooma 2>/dev/null || true')
    } catch { /* ignore */ }
    setTerminalKey((k) => k + 1)
  }

  if (auth.kind === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-dim)]">
        …
      </div>
    )
  }
  if (auth.kind === 'anon') {
    return (
      <LoginScreen
        onLoggedIn={() =>
          api
            .whoami()
            .then((me) => setAuth({ kind: 'logged-in', me }))
            .catch(() => setAuth({ kind: 'anon' }))
        }
      />
    )
  }

  const terminalBar = (
    <div className="flex items-center border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-mono text-xs">
      <span className="text-[var(--color-text-dim)]">tmux · plerooma</span>
      <span className="ml-auto flex items-center gap-3">
        <button
          onClick={newSession}
          title="kill session and start fresh"
          className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          [ new ]
        </button>
        <button
          onClick={() => setShowTerminal(false)}
          title="close terminal"
          className="text-[var(--color-text-dim)] hover:text-[var(--color-danger)]"
        >
          [ × ]
        </button>
      </span>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm">
        <span className="text-base">🦊</span>
        <span className="font-medium text-[var(--color-text)]">plerooma</span>
        <span className="text-[var(--color-text-dim)]">·</span>
        {view === 'editor' ? (
          <span className="truncate font-mono text-xs text-[var(--color-text-dim)]">
            {selectedPath ?? '(no file)'}
            {dirty && <span className="ml-1 text-[var(--color-accent)]">●</span>}
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--color-text-dim)]">
            {view === 'analytics' ? 'analytics' : 'control panel'}
          </span>
        )}

        {/* view nav */}
        <nav className="ml-4 flex items-center gap-1">
          {(['editor', 'control-panel', 'analytics'] as const).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                view === v
                  ? 'bg-[var(--color-bg)] text-[var(--color-text)]'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]'
              }`}
            >
              {v === 'editor' ? 'editor' : v === 'control-panel' ? 'visibility' : 'analytics'}
            </button>
          ))}
        </nav>

        <span className="ml-auto flex items-center gap-2">
          {view === 'editor' && (
            <button
              onClick={() => setShowTerminal((s) => !s)}
              className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {showTerminal ? 'hide terminal' : 'terminal'}
            </button>
          )}
          <span className="text-xs text-[var(--color-text-dim)]">
            {auth.me.caller}
          </span>
          <button
            onClick={logout}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-danger)]"
          >
            logout
          </button>
        </span>
      </header>

      {/* main panels */}
      <div className="min-h-0 flex-1">
        {view === 'analytics' && <Analytics />}
        {view === 'control-panel' && <ControlPanel />}
        {view === 'editor' && (
          <PanelGroup
            direction="horizontal"
            autoSaveId={`${PANEL_STORAGE_KEY}:h`}
          >
            <Panel defaultSize={20} minSize={10} maxSize={50}>
              <FileTree selectedPath={selectedPath} onSelect={setSelectedPath} />
            </Panel>
            <PanelResizeHandle className="w-px bg-[var(--color-border)] hover:w-1 hover:bg-[var(--color-accent)] transition-all" />
            <Panel defaultSize={80} minSize={30}>
              <PanelGroup
                direction="vertical"
                autoSaveId={`${PANEL_STORAGE_KEY}:v`}
              >
                <Panel defaultSize={!isMobile && showTerminal ? 65 : 100} minSize={20}>
                  <Editor path={selectedPath} onDirtyChange={setDirty} />
                </Panel>
                {!isMobile && showTerminal && (
                  <>
                    <PanelResizeHandle className="h-px bg-[var(--color-border)] hover:h-1 hover:bg-[var(--color-accent)] transition-all" />
                    <Panel defaultSize={35} minSize={10} maxSize={80}>
                      <div className="flex h-full flex-col">
                        {terminalBar}
                        <div className="min-h-0 flex-1">
                          <Terminal key={terminalKey} visible={true} />
                        </div>
                      </div>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Mobile fullscreen terminal overlay */}
      {isMobile && showTerminal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1115]">
          {terminalBar}
          <div className="min-h-0 flex-1">
            <Terminal key={terminalKey} visible={true} />
          </div>
        </div>
      )}
    </div>
  )
}
