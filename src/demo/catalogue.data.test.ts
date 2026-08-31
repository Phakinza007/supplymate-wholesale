import { describe, expect, it } from 'vitest'
import catalogue from './catalogue.data.json'

const PACKAGE_UNITS = new Set(['carton', 'pack', 'roll', 'case'])

describe('catalogue.data.json', () => {
  it('gives every category exactly six products', () => {
    const counts = new Map<string, number>()
    for (const product of catalogue.products) {
      counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1)
    }

    expect(catalogue.categories.map((category) => [category.slug, counts.get(category.slug) ?? 0]))
      .toEqual(catalogue.categories.map((category) => [category.slug, 6]))
    expect(catalogue.products).toHaveLength(36)
  })

  it('keeps every product inside a declared category', () => {
    const known = new Set(catalogue.categories.map((category) => category.slug))
    const strays = catalogue.products.filter((product) => !known.has(product.categorySlug))
    expect(strays.map((product) => product.slug)).toEqual([])
  })

  it('keeps ids, slugs, SKUs and sort orders unique', () => {
    const unique = (values: string[]) => new Set(values).size === values.length
    expect(unique(catalogue.products.map((product) => product.id))).toBe(true)
    expect(unique(catalogue.products.map((product) => product.slug))).toBe(true)
    expect(unique(catalogue.products.map((product) => product.sku))).toBe(true)
    expect(unique(catalogue.categories.map((category) => category.id))).toBe(true)
    expect(catalogue.products.map((product) => product.sortOrder))
      .toEqual(Array.from({ length: 36 }, (_, index) => index + 1))
  })

  it('states pack facts a wholesale buyer can act on', () => {
    for (const product of catalogue.products) {
      expect(PACKAGE_UNITS.has(product.packageUnit)).toBe(true)
      expect(product.unitsPerPackage).toBeGreaterThan(0)
      expect(product.minOrderQuantity).toBeGreaterThanOrEqual(1)
      // Nothing may be listed below its own order minimum.
      expect(product.stockQuantity).toBeGreaterThanOrEqual(product.minOrderQuantity)
      expect(product.price).toBeGreaterThan(0)
      expect(product.sku.trim()).not.toBe('')
    }
  })

  it('keeps the ids the seeded sample orders reference', () => {
    const bySlug = new Map(catalogue.products.map((product) => [product.slug, product]))
    expect(bySlug.get('clear-cup-16oz')?.id).toBe('b1000000-0000-0000-0000-000000000001')
    expect(bySlug.get('bagasse-clamshell-9in')?.id).toBe('b1000000-0000-0000-0000-000000000005')
    expect(bySlug.get('thermal-label-50x30')?.id).toBe('b1000000-0000-0000-0000-000000000010')
    expect(bySlug.get('bioplastic-cutlery-set')?.id).toBe('b1000000-0000-0000-0000-000000000018')
    expect(bySlug.get('clear-cup-16oz')?.sortOrder).toBe(1)
  })
})
