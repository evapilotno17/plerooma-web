# plerooma worker proxy

Cloudflare Worker that serves the plerooma admin SPA **and** proxies
the API (`/api/*`, `/healthz`, `/mcp`) to https://plerooma.com on the
same origin.

Use when plerooma.com is blocked by your network's egress filter but
`*.workers.dev` is allowed — corporate workstations, restricted Wi-Fi.

## Deploy

```bash
cd worker
npm install
npx wrangler login        # one-time, opens browser
npm run deploy
```

The deployed URL prints at the end. Open `<url>/admin/`.

## What it does

- `/admin/*`   → built SPA (assets reshaped from `../dist`)
- `/`         → 302 → `/admin/`
- `/api/*`, `/healthz`, `/mcp` → forwarded to https://plerooma.com

The proxy drops `Origin` and `Referer` before forwarding so
plerooma.com's CORS allowlist doesn't reject the Worker as a foreign
origin. Cookies (`plerooma_session`) travel through transparently —
the browser stores them under the Worker host since the upstream
Set-Cookie has no Domain attribute.
