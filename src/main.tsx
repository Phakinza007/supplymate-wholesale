import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { applyBranding } from '@/config/applyBranding'
import { AuthProvider } from '@/core/auth/AuthProvider'
import {
  consumeGitHubPagesAuthCallback,
  isGitHubPagesBuild,
} from '@/lib/githubPagesAuth'
import { supabase } from '@/lib/supabase'
import App from './App.tsx'

applyBranding()

const queryClient = new QueryClient()

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

async function bootstrap() {
  if (isGitHubPagesBuild) {
    const consumedAuthCallback = await consumeGitHubPagesAuthCallback(
      window.location,
      (session) => supabase.auth.setSession(session),
    )
    if (consumedAuthCallback) return
  }

  renderApp()
}

void bootstrap()
