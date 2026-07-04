# plerooma web

The frontend SPA for the plerooma admin — `/admin/` (owner view) and
`/ani/` (public view). React + TypeScript + Vite.

## live URLs

The same SPA is reachable at three places, each solving a different
reachability constraint:

| URL | how it's served | when to use it |
|---|---|---|
| https://plerooma.com/admin/ | bundled with the Go server, served at the same origin | the primary URL — works from anywhere plerooma.com resolves |
| https://evapilotno17.github.io/plerooma-web/admin/ | GitHub Pages, static SPA, cross-origin API calls to plerooma.com | fallback when plerooma.com is down but github.io reachable; also convenient as a public link |
| https://plerooma.1aniruddhpatil-01.workers.dev/admin/ | Cloudflare Worker: same-origin SPA + transparent proxy to plerooma.com | networks that egress-block plerooma.com but allow `*.workers.dev` (corporate workstations, restricted Wi-Fi) |

## build targets

Same source, three build shapes — driven by two env vars:

| target | `VITE_BASE` | `VITE_API_BASE` |
|---|---|---|
| plerooma.com (Go server) | `/admin/` (default) | (empty — same-origin) |
| github.io Pages | `/plerooma-web/admin/` | `https://plerooma.com` |
| Cloudflare Worker | `/admin/` | (empty — same-origin, proxied) |

The Pages build is automated by `.github/workflows/deploy.yml` on push
to `main`. The Worker build + deploy is manual; see [`worker/`](./worker).
The Go server picks up the default build from `dist/`.

## developing

```bash
npm install
npm run dev          # vite dev server at http://localhost:5173/admin/
                     # /api /u /healthz /mcp are proxied to the Go
                     # server at 127.0.0.1:8443 (see vite.config.ts)
npm run build        # tsc + vite → dist/
npm run lint
```

Dev mode assumes the Go server is running on `127.0.0.1:8443`; start
it from `../server/`.
