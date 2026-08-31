import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductPriceTiers(productId: string) {
  return useQuery({
    queryKey: ['admin-price-tiers', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_price_tiers')
        .select('*')
        .eq('product_id', productId)
        .order('min_quantity', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useProductPriceTierMutations(productId: string) {
  const queryClient = useQueryClient()
  // The storefront reads tiers through useProduct's embedded select, so its
  // cache has to be invalidated too or an admin edit won't show up there.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-price-tiers', productId] })
    queryClient.invalidateQueries({ queryKey: ['product'] })
  }

  const addTier = useMutation({
    mutationFn: async (input: { min_quantity: number; unit_price: number }) => {
      const { error } = await supabase
        .from('product_price_tiers')
        .insert({ product_id: productId, ...input })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_price_tiers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { addTier, deleteTier }
}
