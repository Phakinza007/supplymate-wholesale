import { describe, expect, it } from 'vitest'
import { resolveTierPrice, sortTiers, type PriceTier } from './priceTiers'

const tiers: PriceTier[] = [
  { min_quantity: 50, unit_price: 1100 },
  { min_quantity: 10, unit_price: 1200 },
]

describe('resolveTierPrice', () => {
  it('returns the base price below every tier', () => {
    expect(resolveTierPrice(1290, tiers, 9)).toBe(1290)
  })

  it('returns the base price when there are no tiers', () => {
    expect(resolveTierPrice(1290, [], 500)).toBe(1290)
  })

  it('applies a tier exactly at its threshold', () => {
    expect(resolveTierPrice(1290, tiers, 10)).toBe(1200)
  })

  it('keeps the lower tier between thresholds', () => {
    expect(resolveTierPrice(1290, tiers, 49)).toBe(1200)
  })

  it('picks the highest qualifying tier, not the first match', () => {
    expect(resolveTierPrice(1290, tiers, 50)).toBe(1100)
    expect(resolveTierPrice(1290, tiers, 999)).toBe(1100)
  })
})

describe('sortTiers', () => {
  it('sorts ascending by min_quantity', () => {
    expect(sortTiers(tiers).map((t) => t.min_quantity)).toEqual([10, 50])
  })

  it('does not mutate its input', () => {
    const input = [...tiers]
    sortTiers(input)
    expect(input.map((t) => t.min_quantity)).toEqual([50, 10])
  })
})
