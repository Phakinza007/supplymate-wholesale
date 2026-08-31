import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'
import { Toaster } from '@/components/ui/toaster'
import { Feature } from '@/lib/Feature'

const ProductTour = lazy(() => import('@/modules/optional/product-tour'))

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Toaster />
        <Outlet />
      </main>
      <Feature flag="productTour">
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      </Feature>
    </div>
  )
}
