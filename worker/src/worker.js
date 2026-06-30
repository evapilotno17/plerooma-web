// plerooma Worker — same-origin SPA + API proxy.
//
// Deployment shape:
//   <worker>.workers.dev/admin/...   → built SPA (from assets/admin/)
//   <worker>.workers.dev/api/...     → fetch-proxied to https://plerooma.com
//   <worker>.workers.dev/healthz     → proxied
//   <worker>.workers.dev/mcp         → proxied
//   <worker>.workers.dev/            → 302 → /admin/
//
// Why this exists: some corp networks egress-filter requests by
// destination domain. github.io may be allowed while plerooma.com is
// not. Cloudflare Workers run on *.workers.dev, which is often on the
// "well-known infra" side of the allowlist. Serving SPA and API from
// the same Worker host makes the whole admin reachable as one URL with
// no CORS to negotiate.
//
// Cookies: plerooma.com sets `plerooma_session` with SameSite=None;
// Secure; HttpOnly. When the response passes through this Worker, the
// browser stores the cookie under the Worker host (no Domain attr →
// host-only). Subsequent requests carry it back; the Worker forwards
// the Cookie header verbatim to plerooma.com, which validates the
// opaque token regardless of whose host it currently lives under.

const ORIGIN = 'https://plerooma.com'
const PROXY_PATHS = ['/api/', '/healthz', '/mcp']

function shouldProxy(pathname) {
  for (const p of PROXY_PATHS) {
    if (pathname === p.replace(/\/$/, '')) return true
    if (pathname.startsWith(p)) return true
  }
  return false
}

async function proxy(req, pathname, search) {
  // Build a fresh request so we control which headers travel. Origin
  // and Referer get dropped: plerooma.com's CORS allowlist would
  // otherwise reject this Worker's origin as cross-site. The Worker
  // is the trusted intermediary; cookies are forwarded as-is.
  const headers = new Headers(req.headers)
  headers.delete('origin')
  headers.delete('referer')
  headers.delete('host')

  const target = ORIGIN + pathname + search
  const proxyReq = new Request(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
  })
  return fetch(proxyReq)
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)

    if (shouldProxy(url.pathname)) {
      return proxy(req, url.pathname, url.search)
    }

    if (url.pathname === '/') {
      return Response.redirect(url.origin + '/admin/', 302)
    }

    // Static asset (built SPA under assets/admin/).
    const assetRes = await env.ASSETS.fetch(req)

    // SPA client-side routing: if a /admin/<route> path 404s and looks
    // like a route (no file extension in the last segment), fall back
    // to /admin/index.html so React Router / our viewFromPath can
    // handle it.
    if (assetRes.status === 404 && url.pathname.startsWith('/admin/')) {
      const last = url.pathname.split('/').pop() || ''
      if (!last.includes('.')) {
        const fallback = new URL('/admin/index.html', req.url)
        return env.ASSETS.fetch(new Request(fallback, req))
      }
    }

    return assetRes
  },
}
