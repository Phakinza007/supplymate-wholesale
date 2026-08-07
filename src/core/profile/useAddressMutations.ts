import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import type { Database } from '@/lib/database.types'

type AddressInsert = Database['public']['Tables']['addresses']['Insert']
type AddressUpdate = Database['public']['Tables']['addresses']['Update']

export function useAddressMutations() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['addresses', user?.id] })

  const createAddress = useMutation({
    mutationFn: async (input: Omit<AddressInsert, 'user_id'>) => {
      const { error } = await supabase.from('addresses').insert({ ...input, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateAddress = useMutation({
    mutationFn: async ({ id, ...input }: AddressUpdate & { id: string }) => {
      const { error } = await supabase.from('addresses').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteAddress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createAddress, updateAddress, deleteAddress }
}
