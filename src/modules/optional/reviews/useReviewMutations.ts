import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useReviewMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reviews', productId] })

  const submitReview = useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      const { error } = await supabase.rpc('submit_review', {
        p_product_id: productId,
        p_rating: input.rating,
        p_comment: input.comment || undefined,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setReviewActive = useMutation({
    mutationFn: async (input: { reviewId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('reviews')
        .update({ is_active: input.isActive })
        .eq('id', input.reviewId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { submitReview, setReviewActive }
}
