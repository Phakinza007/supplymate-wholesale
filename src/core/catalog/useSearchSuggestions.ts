import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/core/auth/useAuth'
import type { PriceTier } from '@/lib/priceTiers'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

export interface SuggestedProduct extends Product {
  product_price_tiers: PriceTier[]
}

export interface PreviouslyOrdered {
  productSlug: string
  productName: string
  lastOrderedAt: string
}

const MIN_QUERY_LENGTH = 2
const PRODUCT_LIMIT = 5
const HISTORY_LIMIT = 3

export function useSearchSuggestions(query: string) {
  const { user } = useAuth()
  const trimmed = query.trim()
  const enabled = trimmed.length >= MIN_QUERY_LENGTH

  return useQuery({
    queryKey: ['search-suggestions', trimmed, user?.id],
    enabled,
    // Suggestions are throwaway: keeping them fresh for a few seconds is
    // enough, and it stops every keystroke pair refetching the same thing.
    staleTime: 30_000,
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from('products')
        .select('*, product_price_tiers(min_quantity, unit_price)')
        .eq('is_active', true)
        .ilike('name', `%${trimmed}%`)
        .order('sort_order', { ascending: true })
        .limit(PRODUCT_LIMIT)
      if (error) throw error

      let previouslyOrdered: PreviouslyOrdered[] = []
      if (user) {
        // Scoped through `orders.user_id` explicitly rather than trusting RLS
        // to narrow it: `orders` grants admins full read, so an admin's own
        // "you ordered this before" list would otherwise be everyone's.
        const { data: lines, error: historyError } = await supabase
          .from('order_items')
          .select('product_slug, product_name, orders!inner(user_id, created_at)')
          .eq('orders.user_id', user.id)
          .ilike('product_name', `%${trimmed}%`)
          .limit(20)
        if (historyError) throw historyError

        const latest = new Map<string, PreviouslyOrdered>()
        for (const line of lines ?? []) {
          // product_slug is nullable on the snapshot; without it there is
          // nothing to link the suggestion to, so skip the line.
          if (!line.product_slug) continue
          const orderedAt = line.orders.created_at
          const existing = latest.get(line.product_slug)
          if (!existing || existing.lastOrderedAt < orderedAt) {
            latest.set(line.product_slug, {
              productSlug: line.product_slug,
              productName: line.product_name,
              lastOrderedAt: orderedAt,
            })
          }
        }
        previouslyOrdered = [...latest.values()]
          .sort((a, b) => b.lastOrderedAt.localeCompare(a.lastOrderedAt))
          .slice(0, HISTORY_LIMIT)
      }

      return {
        products: (products ?? []) as SuggestedProduct[],
        previouslyOrdered,
      }
    },
  })
}
