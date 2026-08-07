import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useFeature } from '@/lib/useFeature'

const BASE_NAV_ITEMS = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
]

export function AdminLayout() {
  const location = useLocation()
  const promotionsEnabled = useFeature('promotions')
  const navItems = promotionsEnabled
    ? [...BASE_NAV_ITEMS, { to: '/admin/promotions', label: 'Promotions' }]
    : BASE_NAV_ITEMS

  return (
    <div className="flex flex-col gap-6">
      <nav className="mx-auto flex w-full max-w-3xl gap-4 border-b px-4 pt-8 pb-2 text-sm">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              'pb-2',
              location.pathname.startsWith(item.to)
                ? 'border-b-2 border-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
