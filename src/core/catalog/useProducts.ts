import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const DEFAULT_PAGE_SIZE = 12

export function useProducts(params: {
  categoryId?: string
  search?: string
  page: number
  pageSize?: number
  enabled?: boolean
}) {
  const { categoryId, search, page, pageSize = DEFAULT_PAGE_SIZE, enabled = true } = params

  return useQuery({
    queryKey: ['products', { categoryId, search, page, pageSize }],
    enabled,
    queryFn: async () => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('products')
        .select('*, product_images(*)', { count: 'exact' })
        .eq('is_active', true)

      if (categoryId) {
        query = query.eq('category_id', categoryId)
      }
      if (search) {
        query = query.ilike('name', `%${search}%`)
      }

      const { data, error, count } = await query
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      return { products: data, totalCount: count ?? 0 }
    },
  })
}
