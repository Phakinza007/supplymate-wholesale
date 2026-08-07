import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), order_status_history(*)')
        .eq('id', orderId!)
        .order('created_at', { referencedTable: 'order_status_history', ascending: true })
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!orderId,
    retry: false,
  })
}
