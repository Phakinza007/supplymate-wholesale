import { describe, expect, it } from 'vitest'
import {
  clampToMinimum,
  demoCategories,
  demoProducts,
  filterDemoProducts,
  findDemoProduct,
  productImagePath,
} from './catalogue'

describe('SupplyMate static catalogue', () => {
  it('loads the whole shared catalogue', () => {
    expect(demoProducts).toHaveLength(36)
    expect(demoCategories).toHaveLength(6)
  })

  it('finds a product by its stable URL slug', () => {
    expect(findDemoProduct('clear-cup-16oz')?.name).toBe('แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม')
    expect(findDemoProduct('clear-cup-16oz')?.sku).toBe('SM-CUP-16-DOME')
  })

  it('gives every product its own generated illustration', () => {
    expect(productImagePath('clear-cup-16oz')).toBe(
      '/images/supplymate/products/clear-cup-16oz.svg',
    )
    expect(new Set(demoProducts.map((product) => product.imagePath)).size).toBe(36)
  })

  it('keeps the six photographic category tiles', () => {
    expect(demoCategories.map((category) => category.imagePath)).toEqual([
      '/images/supplymate/cups-lids.png',
      '/images/supplymate/food-containers.png',
      '/images/supplymate/paper-bags.png',
      '/images/supplymate/labels.png',
      '/images/supplymate/bar-tools.png',
      '/images/supplymate/eco-packaging.png',
    ])
  })

  it('matches Thai search and category filters together', () => {
    const inCategory = filterDemoProducts(demoProducts, '', 'cups-lids')
    expect(inCategory).toHaveLength(6)

    // "ฝาโดมใส" appears in one product name only; the bare word "แก้ว" now
    // matches most of the category, which is the point of a deeper catalogue.
    const narrow = filterDemoProducts(demoProducts, 'ฝาโดมใส', 'cups-lids')
    expect(narrow.map((product) => product.slug)).toEqual(['dome-lid-95mm'])
  })

  it('searches the category name as well as the product text', () => {
    const results = filterDemoProducts(demoProducts, 'บรรจุภัณฑ์รักษ์โลก', '')
    expect(results).toHaveLength(6)
  })

  it('clamps invalid and below-minimum quantities to the minimum', () => {
    expect(clampToMinimum(0, 3)).toBe(3)
    expect(clampToMinimum(2.5, 3)).toBe(3)
    expect(clampToMinimum(6, 3)).toBe(6)
  })
})
