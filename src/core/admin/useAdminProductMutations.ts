import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { buildDuplicateInput, nextAvailableSlug } from '@/core/admin/duplicateProduct'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']
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

  // The slug read sees every row, active or not: the "products: admin write"
  // policy is `for all`, so it covers SELECT for admins on top of the
  // is_active-gated public read policy. A concurrent duplicate can still lose
  // the race on products_slug_key; that surfaces as a normal mutation error
  // and the admin retries, which is cheaper than serialising this.
  const duplicateProduct = useMutation({
    mutationFn: async (product: Product) => {
      const { data: existing, error: slugError } = await supabase
        .from('products')
        .select('slug')
        .ilike('slug', `${product.slug}%`)
      if (slugError) throw slugError

      const slug = nextAvailableSlug(
        product.slug,
        (existing ?? []).map((row) => row.slug),
      )
      const { data, error } = await supabase
        .from('products')
        .insert(buildDuplicateInput(product, slug))
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  return { createProduct, updateProduct, duplicateProduct }
}
