import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminProducts() {
  return useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        // `product_price_tiers(count)` returns an aggregate, not the rows: the
        // admin list only needs "how many steps does this product have", and
        // pulling every tier for every product would be a lot of rows for a
        // number shown in one cell.
        .select('*, categories(name), product_price_tiers(count)')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
