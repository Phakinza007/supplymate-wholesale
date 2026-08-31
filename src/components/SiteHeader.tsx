import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { brandConfig } from '@/config/branding.config'
import { useAuth } from '@/core/auth/useAuth'
import { useProfile } from '@/core/auth/useProfile'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    // Own height rather than the header's padding: these are the primary
    // navigation on a phone and were 28px tall.
    'inline-flex min-h-11 items-center rounded-sm text-sm font-semibold underline-offset-4 hover:underline',
    isActive && 'text-signal',
  )
}

export function SiteHeader() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const cartCount = useCartTotalItems()
  // A count that changes is easy to miss on a phone. One short bump draws the
  // eye; `bump` is a key, so a rapid second add restarts the motion instead of
  // queueing another one behind it.
  const previousCount = useRef(cartCount)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    if (cartCount > previousCount.current) setBump((n) => n + 1)
    previousCount.current = cartCount
  }, [cartCount])

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5">
        <Link
          to="/"
          className="flex min-h-11 min-w-0 items-center gap-2.5 font-bold tracking-tight"
        >
          <img src={brandConfig.logoUrl} alt="" className="size-8 shrink-0 rounded-md border border-border" />
          <span className="truncate">{brandConfig.storeName}</span>
        </Link>
        <nav
          aria-label="การนำทางหลัก"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          {/* Filled by the product-tour module through a portal. Core may not
              import an optional module, so it renders the slot and nothing
              else; with the flag off this stays empty. */}
          <div id="tour-launcher-slot" className="contents" />
          <NavLink to="/shop" className={navClass}>
            สินค้า
          </NavLink>
          {user && (
            <NavLink to="/orders" className={navClass}>
              คำสั่งซื้อ
            </NavLink>
          )}
          {user && (
            <NavLink to="/account" className={navClass}>
              บัญชี
            </NavLink>
          )}
          {profile?.role === 'admin' && (
            <NavLink to="/admin" className={navClass}>
              หลังบ้าน
            </NavLink>
          )}
          <NavLink to="/cart" className={navClass}>
            <span className="flex items-center gap-1.5">
              <ShoppingCart aria-hidden="true" className="size-4" />
              <span>ตะกร้า</span>
              <span
                key={bump}
                data-slot="cart-count"
                aria-label={`สินค้าในตะกร้า ${cartCount} รายการ`}
                className={cn(
                  'min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-primary-foreground',
                  // Not on first paint: the product register has no page-load
                  // choreography, so this only runs on an actual add.
                  bump > 0 && '[animation:cart-bump_200ms_var(--ease-out-quint)]',
                )}
              >
                {cartCount}
              </span>
            </span>
          </NavLink>
          {user ? (
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => signOut()}>
              ออกจากระบบ
            </Button>
          ) : (
            <NavLink to="/login" className={navClass}>
              เข้าสู่ระบบ
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}
