import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type PromotionInsert = Database['public']['Tables']['promotions']['Insert']
type PromotionUpdate = Database['public']['Tables']['promotions']['Update']

export function useAdminPromotionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })

  const createPromotion = useMutation({
    mutationFn: async (input: PromotionInsert) => {
      const { error } = await supabase.from('promotions').insert(input)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updatePromotion = useMutation({
    mutationFn: async ({ id, ...input }: PromotionUpdate & { id: string }) => {
      const { error } = await supabase.from('promotions').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createPromotion, updatePromotion }
}
