import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductReviews(productId: string) {
  return useQuery({
    queryKey: ['reviews', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, rating, comment, is_active, created_at, user_id')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!productId,
  })
}
