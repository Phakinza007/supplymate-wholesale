import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductImages(productId: string) {
  return useQuery({
    queryKey: ['admin-product-images', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useProductImageMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] })

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${productId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase
        .from('product_images')
        .insert({ product_id: productId, storage_path: path })
      if (insertError) throw insertError
    },
    onSuccess: invalidate,
  })

  const deleteImage = useMutation({
    mutationFn: async (image: { id: string; storage_path: string }) => {
      const { error: deleteError } = await supabase
        .from('product_images')
        .delete()
        .eq('id', image.id)
      if (deleteError) throw deleteError

      const { error: removeError } = await supabase.storage
        .from('product-images')
        .remove([image.storage_path])
      if (removeError) throw removeError
    },
    onSuccess: invalidate,
  })

  return { uploadImage, deleteImage }
}
