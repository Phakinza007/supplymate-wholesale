import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export function useAdminProductMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-products'] })
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const createProduct = useMutation({
    mutationFn: async (input: ProductInsert) => {
      const { data, error } = await supabase.from('products').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...input }: ProductUpdate & { id: string }) => {
      const { error } = await supabase.from('products').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createProduct, updateProduct }
}
