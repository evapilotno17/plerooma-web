import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'

export function Terminal({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const deadRef = useRef(false)       // true once the component unmounts
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    deadRef.current = false

    const term = new XTerm({
      fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0f1115',
        foreground: '#d8dde8',
        cursor: '#f0a85a',
        black: '#0f1115',
        red: '#e57373',
        green: '#a3d977',
        yellow: '#f0a85a',
        blue: '#7ab7e0',
        magenta: '#c994d6',
        cyan: '#7fc8c1',
        white: '#d8dde8',
      },
      cursorBlink: true,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // Register onData and onResize exactly once — they read wsRef so that
    // reconnects don't need to re-register (avoiding duplicate listeners).
    term.onData((data) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })
    term.onResize(({ cols, rows }) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        sendResize(ws, cols, rows)
      }
    })

    function connect() {
      if (deadRef.current) return

      const ws = new WebSocket(api.ptyURL())
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        sendResize(ws, term.cols, term.rows)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          term.write(ev.data)
        } else {
          term.write(new Uint8Array(ev.data as ArrayBuffer))
        }
      }
      ws.onclose = (ev) => {
        // code 1000 = intentional close. anything else = reconnect so the
        // tmux session on melchior is transparently reattached.
        if (deadRef.current) return
        if (ev.code !== 1000) {
          term.write('\r\n\x1b[2m[reconnecting…]\x1b[0m\r\n')
          reconnectTimer.current = setTimeout(connect, 2000)
        } else {
          term.write('\r\n\x1b[2m[connection closed]\x1b[0m\r\n')
        }
      }
      ws.onerror = () => {}
    }

    connect()

    const onWinResize = () => fitRef.current?.fit()
    window.addEventListener('resize', onWinResize)

    return () => {
      deadRef.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      window.removeEventListener('resize', onWinResize)
      wsRef.current?.close(1000, 'unmount')
      term.dispose()
      termRef.current = null
      fitRef.current = null
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (visible) {
      const id = requestAnimationFrame(() => fitRef.current?.fit())
      return () => cancelAnimationFrame(id)
    }
  }, [visible])

  return (
    <div className="h-full w-full bg-[#0f1115] p-2" style={{ display: visible ? 'block' : 'none' }}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

function sendResize(ws: WebSocket, cols: number, rows: number) {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ op: 'resize', cols, rows }))
}
