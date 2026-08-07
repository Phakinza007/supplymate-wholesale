import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
