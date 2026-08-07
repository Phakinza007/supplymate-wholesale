import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const ORDER_STATUSES = ['pending', 'verified', 'shipped', 'done', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export function useAdminOrders(statusFilter?: OrderStatus) {
  return useQuery({
    queryKey: ['admin-orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, order_number, customer_name, status, total, created_at')
        .order('created_at', { ascending: false })
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
