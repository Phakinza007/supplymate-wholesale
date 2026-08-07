import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useReviewEligibility(productId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['review-eligibility', userId, productId],
    queryFn: async () => {
      // Explicitly filter orders by user_id to scope results to the calling user.
      // While RLS policies on orders and order_items exist, they include an is_admin() bypass
      // that would allow admins to see any customer's eligible orders without this filter.
      // The server-side submit_review() RPC still validates ownership, but the UI should not
      // show a false-positive "you can review this" prompt to admins for products they didn't buy.
      const { data, error } = await supabase
        .from('order_items')
        .select('id, orders!inner(status)')
        .eq('product_id', productId)
        .eq('orders.status', 'done')
        .eq('orders.user_id', userId!)
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
    enabled: !!userId && !!productId,
  })
}
