import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useFeature } from '@/lib/useFeature'

const BASE_NAV_ITEMS = [
  { to: '/admin/products', label: 'สินค้า' },
  { to: '/admin/categories', label: 'หมวดสินค้า' },
  { to: '/admin/orders', label: 'คำสั่งซื้อ' },
]

export function AdminLayout() {
  const location = useLocation()
  const promotionsEnabled = useFeature('promotions')
  const navItems = promotionsEnabled
    ? [...BASE_NAV_ITEMS, { to: '/admin/promotions', label: 'โปรโมชัน' }]
    : BASE_NAV_ITEMS

  return (
    // A rail on ink from the medium breakpoint up. The back office and the
    // storefront share a header, so the surface under the nav is what tells the
    // owner which side of the shop they are standing in.
    <div className="mx-auto w-full max-w-6xl md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:px-4 md:py-8">
      <nav
        aria-label="เมนูหลังบ้าน"
        className="border-b border-border bg-foreground text-background md:sticky md:top-24 md:self-start md:rounded-md md:border-0"
      >
        <p className="hidden px-4 pt-4 pb-2 text-xs font-semibold text-background/60 md:block">
          หลังบ้าน
        </p>
        <ul className="flex overflow-x-auto px-2 py-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-2 md:pt-0 md:pb-3">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to)
            return (
              <li key={item.to} className="shrink-0 md:w-full">
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'bg-background/15 text-background'
                      : 'text-background/70 hover:bg-background/10 hover:text-background',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="min-w-0 pt-6 md:pt-0">
        <Outlet />
      </div>
    </div>
  )
}
