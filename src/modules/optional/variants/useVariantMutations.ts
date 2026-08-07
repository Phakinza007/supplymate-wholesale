import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type VariantInsert = Database['public']['Tables']['product_variants']['Insert']
type VariantUpdate = Database['public']['Tables']['product_variants']['Update']

export function useVariantMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['product-variants', productId] })

  const createVariant = useMutation({
    mutationFn: async (input: Omit<VariantInsert, 'product_id'>) => {
      const { error } = await supabase
        .from('product_variants')
        .insert({ ...input, product_id: productId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateVariant = useMutation({
    mutationFn: async ({ id, ...input }: VariantUpdate & { id: string }) => {
      const { error } = await supabase.from('product_variants').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createVariant, updateVariant }
}
