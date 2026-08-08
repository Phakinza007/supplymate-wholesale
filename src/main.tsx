import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyBranding } from '@/config/applyBranding'
import { ShowcaseApp } from '@/showcase/ShowcaseApp'

applyBranding()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShowcaseApp />
  </StrictMode>,
)
