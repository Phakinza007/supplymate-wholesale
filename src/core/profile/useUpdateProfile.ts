import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import type { Database } from '@/lib/database.types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Pick<ProfileUpdate, 'full_name' | 'phone'>) => {
      const { error } = await supabase.from('profiles').update(updates).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
  })
}
