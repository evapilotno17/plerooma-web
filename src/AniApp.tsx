import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { api, apiURL } from './api'
import { AsciiFileTree } from './components/AsciiFileTree'
import { Editor } from './components/Editor'
import { TerminalLite } from './components/TerminalLite'

const PANEL_STORAGE_KEY = 'plerooma:panels:ani'

// Everything on /ani/ is monospace. Demarcations are characters
// (─ │ [ ]) rather than UI components. Buttons are bracketed text.

export default function AniApp() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showTerminal, setShowTerminal] = useState(true)

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)] font-mono text-[13px] text-[var(--color-text)]">
      {/* status bar — single monospace line with │ separators */}
      <header className="flex items-baseline gap-3 border-b border-[var(--color-text-dim)]/30 bg-[var(--color-bg)] px-3 py-1">
        <span className="text-[var(--color-accent)]">ani@plerooma</span>
        <span className="text-[var(--color-text-dim)]">│</span>
        <span className="truncate text-[var(--color-text-dim)]">
          enter without your AT field
        </span>
        <span className="ml-auto flex items-baseline gap-3">
          <button
            onClick={() => setShowTerminal((s) => !s)}
            className={`hover:text-[var(--color-text)] ${
              showTerminal ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'
            }`}
          >
            [ terminal{showTerminal ? '*' : ''} ]
          </button>
          <a
            href="/"
            className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            [ ← / ]
          </a>
        </span>
      </header>

      {/* main area */}
      <div className="min-h-0 flex-1">
        <PanelGroup
          direction="horizontal"
          autoSaveId={`${PANEL_STORAGE_KEY}:h`}
        >
          <Panel defaultSize={26} minSize={14} maxSize={55}>
            <AsciiFileTree
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </Panel>
          <PanelResizeHandle
            // A 1-char wide grabber that shows as a vertical character column
            className="w-[6px] cursor-col-resize bg-[var(--color-bg)] before:block before:h-full before:w-px before:bg-[var(--color-text-dim)]/30 before:mx-auto hover:before:bg-[var(--color-accent)]"
          />
          <Panel defaultSize={74} minSize={30}>
            <PanelGroup
              direction="vertical"
              autoSaveId={`${PANEL_STORAGE_KEY}:v`}
            >
              <Panel defaultSize={showTerminal ? 55 : 100} minSize={20}>
                <Editor
                  path={selectedPath}
                  readOnly
                  tuiStyle
                  readFile={(p) => api.aniReadFile(p)}
                  fileUrl={(p) => apiURL('/api/ani/file?path=' + encodeURIComponent(p))}
                />
              </Panel>
              {showTerminal && (
                <>
                  <PanelResizeHandle
                    className="h-[6px] cursor-row-resize bg-[var(--color-bg)] before:block before:w-full before:h-px before:bg-[var(--color-text-dim)]/30 before:my-auto hover:before:bg-[var(--color-accent)]"
                  />
                  <Panel defaultSize={45} minSize={15} maxSize={80}>
                    <TerminalLite visible={showTerminal} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
