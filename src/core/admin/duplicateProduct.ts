import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

// `is_active` is omitted deliberately: the DB derives it from `status` via
// trg_products_sync_is_active, so sending it would be a write the trigger
// immediately discards.
export type ProductInput = Omit<
  Database['public']['Tables']['products']['Insert'],
  'id' | 'created_at' | 'updated_at' | 'is_active'
>

// products.slug is `not null unique`, so a duplicate needs a slug nobody
// holds. Bounded by `taken.length + 2`, which always contains a free slot
// because at most `taken.length` of the candidates can be occupied.
export function nextAvailableSlug(base: string, taken: string[]): string {
  const used = new Set(taken)
  const first = `${base}-copy`
  if (!used.has(first)) return first

  for (let n = 2; n <= used.size + 2; n += 1) {
    const candidate = `${base}-copy-${n}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error(`could not find a free slug for "${base}"`)
}

// Images are not copied — that would mean duplicating storage objects, which
// is out of scope. The admin re-uploads them on the copy.
export function buildDuplicateInput(product: Product, slug: string): ProductInput {
  return {
    name: `${product.name} (สำเนา)`,
    slug,
    description: product.description,
    price: product.price,
    compare_at_price: product.compare_at_price,
    sku: null,
    stock_quantity: product.stock_quantity,
    track_inventory: product.track_inventory,
    category_id: product.category_id,
    sort_order: product.sort_order,
    status: 'draft',
    package_unit: product.package_unit,
    units_per_package: product.units_per_package,
    min_order_quantity: product.min_order_quantity,
  }
}
