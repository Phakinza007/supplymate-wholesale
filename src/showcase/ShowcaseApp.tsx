import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { ShowcaseCartPage } from '@/showcase/ShowcaseCartPage'
import { ShowcaseCataloguePage } from '@/showcase/ShowcaseCataloguePage'
import { ShowcaseCheckoutPage } from '@/showcase/ShowcaseCheckoutPage'
import { ShowcaseFooter } from '@/showcase/ShowcaseFooter'
import { ShowcaseNotice } from '@/showcase/ShowcaseNotice'
import { ShowcaseProductPage } from '@/showcase/ShowcaseProductPage'
import { toShowcaseAssetUrl } from '@/showcase/assetUrl'

function ShowcaseHeader() {
  const cartCount = useCartTotalItems()

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
              aria-label={`สินค้าในตะกร้า ${cartCount} รายการ`}
              className="showcase-header__cart-count"
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
          <ShowcaseNotice id="showcase-demo-notice" />
          <Routes>
            <Route path="/" element={<ShowcaseCataloguePage mode="home" />} />
            <Route path="/shop" element={<ShowcaseCataloguePage mode="shop" />} />
            <Route path="/products/:slug" element={<ShowcaseProductPage />} />
            <Route path="/cart" element={<ShowcaseCartPage />} />
            <Route path="/checkout" element={<ShowcaseCheckoutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <ShowcaseFooter />
      </div>
    </HashRouter>
  )
}
