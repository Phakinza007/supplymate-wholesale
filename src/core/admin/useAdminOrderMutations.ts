import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminOrderMutations(orderId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] })
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
  }

  const verifyPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'verified' })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const rejectSlip = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const paymentRejectionReason = reason.trim()
      if (!paymentRejectionReason) throw new Error('A rejection reason is required.')

      const { error } = await supabase
        .from('orders')
        .update({
          status: 'pending',
          payment_slip_path: null,
          payment_slip_uploaded_at: null,
          payment_rejection_reason: paymentRejectionReason,
        })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const shipOrder = useMutation({
    mutationFn: async (input: { tracking_number?: string; shipping_carrier?: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'shipped', ...input })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const completeOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('orders').update({ status: 'done' }).eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const cancelOrder = useMutation({
    mutationFn: async (cancel_reason: string) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled', cancel_reason })
        .eq('id', orderId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { verifyPayment, rejectSlip, shipOrder, completeOrder, cancelOrder }
}
