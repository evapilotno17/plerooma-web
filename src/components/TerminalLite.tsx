import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import bannerText from '../banner.txt?raw'

// A DOM-based REPL for /ani/. No xterm.js — just a scrollable history
// area + an input line. Native browser scroll behaves correctly out of
// the box, copy-paste works, and the markup matches the rest of the
// TUI aesthetic on /ani/.
//
// Only a tiny subset of ANSI escape sequences is parsed (the ones our
// server actually emits: amber, dim, red, clear). Anything else is
// stripped silently.

type HistoryItem =
  | { kind: 'banner'; html: React.ReactNode }
  | { kind: 'cmd'; prompt: string; cmd: string; output: string }

// The banner is ani's actual zsh greeting — figlet of "god's in his
// heaven, all's right with the world" + a neofetch-style system info
// block. Loaded as raw text via Vite's ?raw import so spacing is
// preserved exactly.
const BANNER: HistoryItem = {
  kind: 'banner',
  html: (
    <pre className="whitespace-pre leading-[1.15] text-[var(--color-text)]">
      {bannerText}
    </pre>
  ),
}

export function TerminalLite({ visible }: { visible: boolean }) {
  const [history, setHistory] = useState<HistoryItem[]>([BANNER])
  const [cwd, setCwd] = useState('/')
  const [input, setInput] = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cmdHistRef = useRef<string[]>([])

  // Auto-scroll to bottom on every history change. Every change is
  // user-initiated (submit), so always show the result. The earlier
  // "only if near bottom" heuristic skipped scroll when output was
  // larger than the viewport — exactly the case where scrolling matters.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Use rAF so we measure after React commits the new height.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [history])

  // Focus input on visible.
  useEffect(() => {
    if (visible && !closed) {
      inputRef.current?.focus()
    }
  }, [visible, closed])

  async function submit() {
    if (busy) return
    const line = input
    setInput('')
    setHistIdx(-1)

    if (line.trim() === '') {
      // empty submit — just echo a new prompt by adding an empty history item
      setHistory((h) => [...h, { kind: 'cmd', prompt: cwd, cmd: '', output: '' }])
      inputRef.current?.focus()
      return
    }

    cmdHistRef.current.push(line)
    setBusy(true)
    try {
      const res = await api.aniCmd(line, cwd)
      if (res.cls) {
        // 'clear' resets history but keeps the banner
        setHistory([BANNER])
      } else {
        setHistory((h) => [
          ...h,
          { kind: 'cmd', prompt: cwd, cmd: line, output: res.output ?? '' },
        ])
      }
      setCwd(res.cwd || '/')
      if (res.bye) {
        setClosed(true)
      }
    } catch (e) {
      setHistory((h) => [
        ...h,
        {
          kind: 'cmd',
          prompt: cwd,
          cmd: line,
          output: '\x1b[31merror: ' + (e as Error).message + '\x1b[0m\n',
        },
      ])
    } finally {
      setBusy(false)
      // Belt-and-suspenders refocus. The input never gets `disabled`
      // (which would steal focus), but if anything else in the page
      // grabbed it (overlay, devtools click, etc.), bring it back.
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (busy) return // ignore Enter while a command is in flight
      submit()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const hist = cmdHistRef.current
      if (hist.length === 0) return
      if (histIdx === -1) {
        setDraft(input)
        setHistIdx(hist.length - 1)
        setInput(hist[hist.length - 1])
      } else if (histIdx > 0) {
        setHistIdx(histIdx - 1)
        setInput(hist[histIdx - 1])
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const hist = cmdHistRef.current
      if (histIdx === -1) return
      if (histIdx < hist.length - 1) {
        const next = histIdx + 1
        setHistIdx(next)
        setInput(hist[next])
      } else {
        setHistIdx(-1)
        setInput(draft)
      }
      return
    }
    if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setHistory([BANNER])
      return
    }
  }

  if (closed) {
    return (
      <div
        className="flex h-full items-center justify-center gap-3 bg-[var(--color-bg)] font-mono text-sm text-[var(--color-text-dim)]"
        style={{ display: visible ? 'flex' : 'none' }}
      >
        <span>[ session closed ]</span>
        <button
          onClick={() => {
            setClosed(false)
            setHistory([BANNER])
            setCwd('/')
          }}
          className="text-[var(--color-accent)] hover:underline"
        >
          [ open new ]
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col bg-[var(--color-bg)] font-mono text-[13px] leading-[1.45]"
      style={{ display: visible ? 'flex' : 'none' }}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 pt-2 text-[var(--color-text)] whitespace-pre-wrap break-words"
      >
        {history.map((h, i) => (
          <HistoryRow key={i} item={h} />
        ))}
      </div>
      <div className="flex items-baseline gap-2 px-3 py-2 text-[var(--color-text)]">
        <span className="text-[var(--color-accent)]">{cwd}</span>
        <span className="text-[var(--color-text-dim)]">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            if (busy) return // don't accept typing during in-flight command
            setInput(e.target.value)
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className={`flex-1 bg-transparent text-[var(--color-text)] outline-none ${busy ? 'opacity-60' : ''}`}
          aria-label="terminal input"
        />
      </div>
    </div>
  )
}

function HistoryRow({ item }: { item: HistoryItem }) {
  if (item.kind === 'banner') {
    return <div className="mb-3">{item.html}</div>
  }
  return (
    <div className="mb-1">
      <div>
        <span className="text-[var(--color-accent)]">{item.prompt}</span>
        <span className="text-[var(--color-text-dim)]"> $ </span>
        <span>{item.cmd}</span>
      </div>
      {item.output && <AnsiText source={item.output} />}
    </div>
  )
}

// AnsiText parses a small whitelist of escape sequences and renders the
// rest as plain text. Spans are produced lazily; everything we don't
// recognize is dropped silently.
function AnsiText({ source }: { source: string }) {
  const parts = useMemo(() => parseAnsi(source), [source])
  return (
    <span>
      {parts.map((p, i) => (
        <span key={i} className={classFor(p.color)}>
          {p.text}
        </span>
      ))}
    </span>
  )
}

type AnsiPart = { text: string; color: 'default' | 'accent' | 'dim' | 'red' }

function parseAnsi(src: string): AnsiPart[] {
  const out: AnsiPart[] = []
  let i = 0
  let cur: AnsiPart['color'] = 'default'
  let buf = ''
  const flush = () => {
    if (buf) {
      out.push({ text: buf, color: cur })
      buf = ''
    }
  }
  while (i < src.length) {
    if (src[i] === '\x1b' && src[i + 1] === '[') {
      // find the trailing letter
      let j = i + 2
      while (j < src.length && !((src.charCodeAt(j) >= 64 && src.charCodeAt(j) <= 126))) {
        j++
      }
      const code = src.slice(i + 2, j)
      const final = src[j]
      flush()
      if (final === 'm') {
        const ansiToColor = mapAnsiToColor(code)
        if (ansiToColor !== undefined) cur = ansiToColor
      }
      // 'J' and 'H' (clear, home) are handled at the parent level (cls
      // flag); here we just consume and ignore.
      i = j + 1
      continue
    }
    if (src[i] === '\r') {
      // ignore CRs; we use LF as the newline
      i++
      continue
    }
    buf += src[i]
    i++
  }
  flush()
  return out
}

function mapAnsiToColor(code: string): AnsiPart['color'] | undefined {
  // very small whitelist matching what the Go side emits
  if (code === '0' || code === '') return 'default'
  if (code === '2') return 'dim'
  if (code === '31') return 'red'
  if (code === '38;5;215') return 'accent'
  // ignore others; keep current color
  return undefined
}

function classFor(c: AnsiPart['color']): string {
  switch (c) {
    case 'accent':
      return 'text-[var(--color-accent)]'
    case 'dim':
      return 'text-[var(--color-text-dim)]'
    case 'red':
      return 'text-[var(--color-danger)]'
    default:
      return ''
  }
}
