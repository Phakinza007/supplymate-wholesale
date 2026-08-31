import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'
import { Toaster } from '@/components/ui/toaster'

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Toaster />
        <Outlet />
      </main>
    </div>
  )
}
