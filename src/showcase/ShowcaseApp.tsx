import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { ShowcaseCartPage } from '@/showcase/ShowcaseCartPage'
import { ShowcaseCataloguePage } from '@/showcase/ShowcaseCataloguePage'
import { ShowcaseCheckoutPage } from '@/showcase/ShowcaseCheckoutPage'
import { ShowcaseNotice } from '@/showcase/ShowcaseNotice'
import { ShowcaseProductPage } from '@/showcase/ShowcaseProductPage'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

function ShowcaseHeader() {
  const cartCount = useCartTotalItems()

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img
            src={toShowcaseAssetUrl('/images/supplymate/brandmark.svg')}
            alt=""
            className="size-8 rounded-lg"
          />
          <span>SupplyMate Wholesale</span>
        </Link>
        <nav aria-label="การนำทางหลัก" className="flex items-center gap-4 text-sm font-medium">
          <Link to="/shop" className="hover:underline">
            สินค้า
          </Link>
          <Link to="/cart" className="flex items-center gap-1.5 hover:underline">
            <span>ตะกร้า</span>
            <span
              aria-label={`สินค้าในตะกร้า ${cartCount} รายการ`}
              className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground"
            >
              {cartCount}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  )
}

export function ShowcaseApp() {
  return (
    <HashRouter>
      <div className="flex min-h-svh flex-col">
        <ShowcaseHeader />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8">
          <ShowcaseNotice />
          <Routes>
            <Route path="/" element={<ShowcaseCataloguePage mode="home" />} />
            <Route path="/shop" element={<ShowcaseCataloguePage mode="shop" />} />
            <Route path="/products/:slug" element={<ShowcaseProductPage />} />
            <Route path="/cart" element={<ShowcaseCartPage />} />
            <Route path="/checkout" element={<ShowcaseCheckoutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
