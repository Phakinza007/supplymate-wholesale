// The single place the tier rule is expressed on the client. It is display
// only -- create_order() resolves the price again server-side and always
// wins, per this project's standing rule that a client-side check is never
// trusted by the mutating RPC.
export interface PriceTier {
  min_quantity: number
  unit_price: number
}

export function sortTiers<T extends PriceTier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
}

// The applicable tier is the one with the highest min_quantity still <= the
// quantity ordered. With none qualifying, the product's base price applies.
export function resolveTierPrice(
  basePrice: number,
  tiers: PriceTier[],
  quantity: number,
): number {
  let best: PriceTier | null = null
  for (const tier of tiers) {
    if (tier.min_quantity <= quantity && (!best || tier.min_quantity > best.min_quantity)) {
      best = tier
    }
  }
  return best ? Number(best.unit_price) : basePrice
}
