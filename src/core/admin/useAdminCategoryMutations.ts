import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type CategoryInsert = Database['public']['Tables']['categories']['Insert']
type CategoryUpdate = Database['public']['Tables']['categories']['Update']

export function useAdminCategoryMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
  }

  const createCategory = useMutation({
    mutationFn: async (input: CategoryInsert) => {
      const { error } = await supabase.from('categories').insert(input)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...input }: CategoryUpdate & { id: string }) => {
      const { error } = await supabase.from('categories').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createCategory, updateCategory }
}
