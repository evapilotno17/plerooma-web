import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// During `vite dev` the UI runs on a separate port (5173 by default) and
// the Go server is on 8443. The proxy forwards /api, /u, /healthz, /mcp
// to the Go server so dev-mode auth (cookies) work same-origin.
//
// `vite build` writes to ./dist which the Go server serves at / in
// production.
//
// VITE_BASE     — overrides the `base` below. Default is `/admin/`
//                 (matches the Go server's mount point at
//                 plerooma.com/admin/). The GitHub Pages workflow sets
//                 this to `/plerooma-web/admin/` to match the Pages URL.
// VITE_API_BASE — used by src/api.ts. Empty for same-origin builds; set
//                 to `https://plerooma.com` for cross-origin (Pages)
//                 builds. See src/api.ts.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The SPA lives at /admin/ in production. Vite uses this to prefix
  // asset URLs (so index.html references /admin/assets/index-*.js, etc.)
  // and to set the dev-server root. In dev (`vite dev`), Vite still
  // serves at http://localhost:5173/admin/ to mirror production.
  base: process.env.VITE_BASE || '/admin/',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8443',
        changeOrigin: true,
        ws: true, // proxy websockets too (for /api/exec/pty)
      },
      '/public': { target: 'http://127.0.0.1:8443', changeOrigin: true },
      '/u': { target: 'http://127.0.0.1:8443', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8443', changeOrigin: true },
      '/mcp': { target: 'http://127.0.0.1:8443', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
