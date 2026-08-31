import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyBranding } from '@/config/applyBranding'

applyBranding()

const root = createRoot(document.getElementById('root')!)
const render = (app: ReactNode) => root.render(<StrictMode>{app}</StrictMode>)

// Both imports are dynamic and the branch is on a build-time literal, so only
// one entry is ever bundled into a given build. That matters in both
// directions: the showcase must load without Supabase env vars (importing
// src/App.tsx would throw at module scope), and the Pages bundle must not ship
// Supabase code at all. See the comment in vite.config.ts.
if (import.meta.env.VITE_SHOWCASE_MODE === 'false') {
  void import('@/App').then(({ default: App }) => render(<App />))
} else {
  void import('@/showcase/ShowcaseApp').then(({ ShowcaseApp }) => render(<ShowcaseApp />))
}
