import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'

export function useOrders() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        // `order_items(count)` is an aggregate, not the rows: the list only
        // needs "how many lines". The per-piece figure the design shows cannot
        // come from here at all — order_items snapshots quantity but not
        // units_per_package, and today's pack size may not be the one the
        // order was placed at.
        .select('id, order_number, status, total, created_at, payment_method, order_items(count)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}
