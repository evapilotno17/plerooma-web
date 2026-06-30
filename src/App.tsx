import AdminApp from './AdminApp'
import AniApp from './AniApp'

// One bundle, two mount points. Vite's `base` is /admin/ which means
// assets always live at /admin/assets/, but the same index.html is
// also served at /ani/ — the JS just inspects location and decides
// which root component to render.
export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/ani')) {
    return <AniApp />
  }
  return <AdminApp />
}
