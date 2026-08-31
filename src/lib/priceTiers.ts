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

// One row of the ladder a customer sees. `to` is null on the last row, which
// is open-ended ("100+"). The base price is always row 0: without it the
// table would start mid-ladder and the discounts would have nothing to be a
// discount *from*.
export interface PriceTierRow {
  from: number
  to: number | null
  unitPrice: number
  perPiecePrice: number | null
  savingsPct: number
  isCurrent: boolean
}

// `units_per_package` is how many pieces are in one carton/pack. The per-piece
// price is the number wholesale buyers actually compare between suppliers, so
// it is derived here rather than at each call site.
function perPiece(unitPrice: number, unitsPerPackage: number): number | null {
  if (!Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) return null
  return unitPrice / unitsPerPackage
}

export function buildTierRows(
  basePrice: number,
  tiers: PriceTier[],
  minOrderQuantity: number,
  unitsPerPackage: number,
  quantity: number,
): PriceTierRow[] {
  const ladder = sortTiers(tiers)
  const starts = [minOrderQuantity, ...ladder.map((t) => t.min_quantity)]
  const prices = [basePrice, ...ladder.map((t) => Number(t.unit_price))]

  return starts.map((from, i) => {
    const nextStart = starts[i + 1]
    const unitPrice = prices[i]
    return {
      from,
      to: nextStart === undefined ? null : nextStart - 1,
      unitPrice,
      perPiecePrice: perPiece(unitPrice, unitsPerPackage),
      savingsPct: basePrice > 0 ? Math.round(((basePrice - unitPrice) / basePrice) * 100) : 0,
      isCurrent: quantity >= from && (nextStart === undefined || quantity < nextStart),
    }
  })
}

export interface TierUpgrade {
  minQuantity: number
  unitPrice: number
  unitsNeeded: number
  savings: number
}

// The nudge under the ladder: "N more cartons drops you to ฿X". `savings` is
// what the buyer keeps by ordering the next tier's minimum at the cheaper
// price instead of at their current one -- the comparison they'd make.
export function nextTierUpgrade(
  basePrice: number,
  tiers: PriceTier[],
  quantity: number,
): TierUpgrade | null {
  const next = sortTiers(tiers).find((t) => t.min_quantity > quantity)
  if (!next) return null

  const current = resolveTierPrice(basePrice, tiers, quantity)
  const unitPrice = Number(next.unit_price)
  return {
    minQuantity: next.min_quantity,
    unitPrice,
    unitsNeeded: next.min_quantity - quantity,
    savings: Math.round((current - unitPrice) * next.min_quantity),
  }
}
