import { describe, expect, it } from 'vitest'
import {
  buildTierRows,
  nextTierUpgrade,
  resolveTierPrice,
  sortTiers,
  type PriceTier,
} from './priceTiers'

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

describe('buildTierRows', () => {
  // 1 ลัง = 1,000 ชิ้น, MOQ 1, base ฿1,290 with the design's tier ladder.
  const ladder: PriceTier[] = [
    { min_quantity: 5, unit_price: 1240 },
    { min_quantity: 10, unit_price: 1190 },
    { min_quantity: 20, unit_price: 1160 },
  ]

  it('puts the base price first, ending just below the cheapest tier', () => {
    const rows = buildTierRows(1290, ladder, 1, 1000, 1)
    expect(rows[0]).toMatchObject({ from: 1, to: 4, unitPrice: 1290, savingsPct: 0 })
  })

  it('closes each tier range at the next tier, leaving the last open-ended', () => {
    const rows = buildTierRows(1290, ladder, 1, 1000, 1)
    expect(rows.map((r) => [r.from, r.to])).toEqual([
      [1, 4],
      [5, 9],
      [10, 19],
      [20, null],
    ])
  })

  it('starts the base row at the minimum order quantity, not at 1', () => {
    expect(buildTierRows(1290, ladder, 3, 1000, 3)[0].from).toBe(3)
  })

  it('computes per-piece price from units per package', () => {
    const rows = buildTierRows(1290, ladder, 1, 1000, 1)
    expect(rows[0].perPiecePrice).toBeCloseTo(1.29)
    expect(rows[2].perPiecePrice).toBeCloseTo(1.19)
  })

  it('computes savings against the base price, rounded to whole percent', () => {
    const rows = buildTierRows(1290, ladder, 1, 1000, 1)
    expect(rows.map((r) => r.savingsPct)).toEqual([0, 4, 8, 10])
  })

  it('marks exactly the row the quantity falls in', () => {
    const at12 = buildTierRows(1290, ladder, 1, 1000, 12)
    expect(at12.filter((r) => r.isCurrent).map((r) => r.from)).toEqual([10])
    const at3 = buildTierRows(1290, ladder, 1, 1000, 3)
    expect(at3.filter((r) => r.isCurrent).map((r) => r.from)).toEqual([1])
    const at999 = buildTierRows(1290, ladder, 1, 1000, 999)
    expect(at999.filter((r) => r.isCurrent).map((r) => r.from)).toEqual([20])
  })

  it('returns only the base row when the product has no tiers', () => {
    const rows = buildTierRows(890, [], 2, 300, 5)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ from: 2, to: null, isCurrent: true, savingsPct: 0 })
  })

  it('leaves per-piece price null when units per package is unusable', () => {
    expect(buildTierRows(1290, ladder, 1, 0, 1)[0].perPiecePrice).toBeNull()
  })
})

describe('nextTierUpgrade', () => {
  const ladder: PriceTier[] = [
    { min_quantity: 5, unit_price: 1240 },
    { min_quantity: 10, unit_price: 1190 },
    { min_quantity: 20, unit_price: 1160 },
  ]

  it('names the next tier up, how many more units, and what that saves', () => {
    // At 12 the buyer pays 1190; 8 more reaches 1160, worth 30 x 20 = 600.
    expect(nextTierUpgrade(1290, ladder, 12)).toEqual({
      minQuantity: 20,
      unitPrice: 1160,
      unitsNeeded: 8,
      savings: 600,
    })
  })

  it('skips tiers already reached', () => {
    expect(nextTierUpgrade(1290, ladder, 5)?.minQuantity).toBe(10)
  })

  it('returns null once the top tier is reached', () => {
    expect(nextTierUpgrade(1290, ladder, 20)).toBeNull()
    expect(nextTierUpgrade(1290, ladder, 500)).toBeNull()
  })

  it('returns null when there are no tiers at all', () => {
    expect(nextTierUpgrade(1290, [], 3)).toBeNull()
  })
})
