import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { brandConfig } from '@/config/branding.config'
import { useAuth } from '@/core/auth/useAuth'
import { useProfile } from '@/core/auth/useProfile'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'

export function SiteHeader() {
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const cartCount = useCartTotalItems()

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src={brandConfig.logoUrl} alt="" className="size-8 rounded-lg" />
          <span>{brandConfig.storeName}</span>
        </Link>
        <nav aria-label="การนำทางหลัก" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link to="/shop" className="hover:underline">
            สินค้า
          </Link>
          <Link to="/cart" className="relative flex items-center gap-1.5 hover:underline">
            <ShoppingCart aria-hidden="true" className="size-5" />
            <span>ตะกร้า</span>
            {cartCount > 0 && (
              <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {cartCount}
              </span>
            )}
          </Link>
          {user ? (
            <>
              {profile?.role === 'admin' && (
                <Link to="/admin" className="hover:underline">
                  หลังบ้าน
                </Link>
              )}
              <Link to="/orders" className="hover:underline">
                คำสั่งซื้อ
              </Link>
              <Link to="/account" className="hover:underline">
                บัญชี
              </Link>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                ออกจากระบบ
              </Button>
            </>
          ) : (
            <Link to="/login" className="hover:underline">
              เข้าสู่ระบบ
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
