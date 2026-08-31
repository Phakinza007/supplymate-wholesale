import { useEffect, useRef, useState } from 'react'
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import '@/showcase/showcase.css'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { ShowcaseCartPage } from '@/showcase/ShowcaseCartPage'
import { ShowcaseCataloguePage } from '@/showcase/ShowcaseCataloguePage'
import { ShowcaseCheckoutPage } from '@/showcase/ShowcaseCheckoutPage'
import { ShowcaseFooter } from '@/showcase/ShowcaseFooter'
import { ShowcaseNotice } from '@/showcase/ShowcaseNotice'
import { Toaster } from '@/components/ui/toaster'
import { PrimitivesPage } from '@/showcase/PrimitivesPage'
import { ShowcaseProductPage } from '@/showcase/ShowcaseProductPage'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

function ShowcaseHeader() {
  const cartCount = useCartTotalItems()
  const previousCount = useRef(cartCount)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (cartCount > previousCount.current) setBump((n) => n + 1)
    previousCount.current = cartCount
  }, [cartCount])

  return (
    <header className="showcase-header">
      <div className="showcase-utility">
        <div className="showcase-utility__inner">
          <span>แคตตาล็อกสำหรับร้านอาหาร คาเฟ่ และครัวกลาง</span>
          <span>ข้อมูลตัวอย่างจากเครื่องนี้เท่านั้น</span>
        </div>
      </div>
      <div className="showcase-header__inner">
        <Link to="/" className="showcase-header__brand">
          <img
            src={toShowcaseAssetUrl('/images/supplymate/brandmark.svg')}
            alt=""
            className="showcase-header__brandmark"
          />
          <span>SupplyMate Wholesale</span>
        </Link>
        <nav aria-label="การนำทางหลัก" className="showcase-header__nav">
          <Link to="/shop">
            แคตตาล็อก
          </Link>
          <Link to="/">วิธีสั่งซื้อ (เดโม)</Link>
          <Link to="/cart" className="showcase-header__cart">
            <span>ตะกร้า</span>
            <span
              key={bump}
              data-slot="cart-count"
              aria-label={`สินค้าในตะกร้า ${cartCount} รายการ`}
              className={
                bump > 0
                  ? 'showcase-header__cart-count [animation:cart-bump_200ms_var(--ease-out-quint)]'
                  : 'showcase-header__cart-count'
              }
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
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:py-7">
          {/* The single standing disclosure. Pages restate only the part that
              applies to the action in front of the buyer — see
              showcase-commit-caption. */}
          <Toaster />
          <ShowcaseNotice id="showcase-demo-notice" />
          <Routes>
            <Route path="/" element={<ShowcaseCataloguePage mode="home" />} />
            <Route path="/shop" element={<ShowcaseCataloguePage mode="shop" />} />
            <Route path="/products/:slug" element={<ShowcaseProductPage />} />
            <Route path="/cart" element={<ShowcaseCartPage />} />
            <Route path="/checkout" element={<ShowcaseCheckoutPage />} />
            {/* Design-system workbench. Unlinked on purpose — see PrimitivesPage. */}
            <Route path="/dev/primitives" element={<PrimitivesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ShowcaseFooter />
      </div>
    </HashRouter>
  )
}
