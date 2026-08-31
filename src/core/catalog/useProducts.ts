import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const DEFAULT_PAGE_SIZE = 12

// `perPiece` sorts on the generated products.price_per_piece column. It has to
// be a server-side sort: the catalogue is paginated, so ordering the fetched
// page would reorder twelve rows and call it "cheapest first".
export type ProductSort = 'default' | 'perPiece' | 'newest'

export const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: 'default', label: 'แนะนำ' },
  { value: 'perPiece', label: 'ราคาต่อชิ้น ↑' },
  { value: 'newest', label: 'มาใหม่' },
]

export function useProducts(params: {
  categoryId?: string
  search?: string
  sort?: ProductSort
  tieredOnly?: boolean
  page: number
  pageSize?: number
  enabled?: boolean
}) {
  const {
    categoryId,
    search,
    sort = 'default',
    tieredOnly = false,
    page,
    pageSize = DEFAULT_PAGE_SIZE,
    enabled = true,
  } = params

  return useQuery({
    queryKey: ['products', { categoryId, search, sort, tieredOnly, page, pageSize }],
    enabled,
    queryFn: async () => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('products')
        // Tier rows come along so a card can show the step count and the
        // cheapest step. A page holds twelve products and a product holds at
        // most ten tiers, so this stays a small join, not an N+1.
        .select('*, product_images(*), product_price_tiers(min_quantity, unit_price)', {
          count: 'exact',
        })
        .eq('is_active', true)

      if (categoryId) {
        query = query.eq('category_id', categoryId)
      }
      if (search) {
        query = query.ilike('name', `%${search}%`)
      }
      if (tieredOnly) {
        // An inner join on the embedded table: keeps only products that have at
        // least one tier row.
        query = query.not('product_price_tiers', 'is', null)
      }

      if (sort === 'perPiece') {
        query = query.order('price_per_piece', { ascending: true, nullsFirst: false })
      } else if (sort === 'newest') {
        query = query.order('created_at', { ascending: false })
      } else {
        query = query.order('sort_order', { ascending: true }).order('created_at', {
          ascending: false,
        })
      }

      const { data, error, count } = await query.range(from, to)

      if (error) throw error
      return { products: data, totalCount: count ?? 0 }
    },
  })
}
