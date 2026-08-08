import { describe, expect, it } from 'vitest'
import {
  clampToMinimum,
  demoProducts,
  filterDemoProducts,
  findDemoProduct,
} from './catalogue'

describe('SupplyMate static catalogue', () => {
  it('finds a product by its stable URL slug', () => {
    expect(findDemoProduct('clear-cup-16oz')?.name).toBe('แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม')
  })

  it('matches Thai search and category filters together', () => {
    const results = filterDemoProducts(demoProducts, 'แก้ว', 'cups-lids')
    expect(results.map((product) => product.slug)).toEqual(['clear-cup-16oz'])
  })

  it('clamps invalid and below-minimum quantities to the minimum', () => {
    expect(clampToMinimum(0, 3)).toBe(3)
    expect(clampToMinimum(2.5, 3)).toBe(3)
    expect(clampToMinimum(6, 3)).toBe(6)
  })
})
