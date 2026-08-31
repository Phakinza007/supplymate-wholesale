import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/core/cart/cartStore'
import { resolveTierPrice } from '@/lib/priceTiers'
import type { PackageUnit } from '@/lib/wholesale'

export interface ReorderResult {
  added: number
  /** Lines that could not be re-added, with why. */
  skipped: { name: string; reason: string }[]
}

// Re-ordering reads the old order's lines but never its prices: it looks each
// product up again and re-resolves the tier at today's ladder. An order from
// six weeks ago is a shopping list, not a price quote — and create_order()
// re-prices everything server-side anyway, so carrying the old number into the
// cart would only set up a surprise at checkout.
export function useReorder() {
  const addItem = useCartStore((state) => state.addItem)

  return useMutation({
    mutationFn: async (orderId: string): Promise<ReorderResult> => {
      const { data: items, error } = await supabase
        .from('order_items')
        .select('product_id, variant_id, product_name, quantity')
        .eq('order_id', orderId)
      if (error) throw error
      if (!items || items.length === 0) {
        return { added: 0, skipped: [] }
      }

      const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[]
      const { data: products, error: productError } = await supabase
        .from('products')
        .select('*, product_images(storage_path, sort_order), product_price_tiers(*)')
        .in('id', productIds)
        .eq('is_active', true)
      if (productError) throw productError

      const byId = new Map((products ?? []).map((p) => [p.id, p]))
      const skipped: ReorderResult['skipped'] = []
      let added = 0

      for (const item of items) {
        const product = item.product_id ? byId.get(item.product_id) : undefined
        if (!product) {
          skipped.push({ name: item.product_name, reason: 'ไม่มีขายแล้ว' })
          continue
        }
        // A variant line cannot be restored from here: this query does not
        // fetch variants, and quietly dropping to the base product would
        // change what the buyer actually ordered.
        if (item.variant_id) {
          skipped.push({ name: item.product_name, reason: 'ต้องเลือกตัวเลือกใหม่' })
          continue
        }

        const quantity = Math.max(item.quantity, product.min_order_quantity)
        const image = [...(product.product_images ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order,
        )[0]

        addItem(
          {
            productId: product.id,
            variantId: null,
            productName: product.name,
            productSlug: product.slug,
            variantName: null,
            unitPrice: resolveTierPrice(
              Number(product.price),
              product.product_price_tiers ?? [],
              quantity,
            ),
            imagePath: image?.storage_path ?? null,
            packageUnit: product.package_unit as PackageUnit,
            minOrderQuantity: product.min_order_quantity,
          },
          quantity,
        )
        added += 1
      }

      return { added, skipped }
    },
  })
}
