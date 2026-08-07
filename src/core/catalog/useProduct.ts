import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*), categories(name, slug)')
        .eq('slug', slug!)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!slug,
    retry: false,
  })
}
