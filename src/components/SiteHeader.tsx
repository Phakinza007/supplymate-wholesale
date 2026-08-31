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
    'rounded-sm py-1 text-sm font-semibold underline-offset-4 hover:underline',
    isActive && 'text-signal',
  )
}

export function SiteHeader() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const cartCount = useCartTotalItems()

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 font-bold tracking-tight"
        >
          <img src={brandConfig.logoUrl} alt="" className="size-8 shrink-0 rounded-md border border-border" />
          <span className="truncate">{brandConfig.storeName}</span>
        </Link>
        <nav
          aria-label="การนำทางหลัก"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
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
                aria-label={`สินค้าในตะกร้า ${cartCount} รายการ`}
                className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-primary-foreground"
              >
                {cartCount}
              </span>
            </span>
          </NavLink>
          {user ? (
            <Button variant="outline" size="sm" onClick={() => signOut()}>
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
