import { supabase } from '@/lib/supabase'

/**
 * product_images.storage_path and categories.image_path are either a path in
 * the public `product-images` bucket, or (for seed/demo rows) an absolute
 * http(s) URL. This is the one place that distinction is handled.
 */
export function resolveImageUrl(path: string): string {
  if (path.startsWith('/')) {
    return path
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
