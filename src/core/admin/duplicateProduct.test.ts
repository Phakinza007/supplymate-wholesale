import { describe, expect, it } from 'vitest'
import { buildDuplicateInput, nextAvailableSlug } from './duplicateProduct'
import type { Database } from '@/lib/database.types'

type Product = Database['public']['Tables']['products']['Row']

const product: Product = {
  category_id: 'cat-1',
  compare_at_price: 1490,
  created_at: '2026-08-01T00:00:00Z',
  description: 'แก้วพลาสติกใส',
  has_variants: false,
  id: 'prod-1',
  is_active: true,
  metadata: {},
  min_order_quantity: 3,
  name: 'แก้วพลาสติกใส 16 ออนซ์',
  package_unit: 'carton',
  price: 1290,
  sku: 'CUP-16',
  slug: 'clear-cup-16oz',
  sort_order: 5,
  status: 'active',
  stock_quantity: 40,
  track_inventory: true,
  units_per_package: 50,
  updated_at: '2026-08-01T00:00:00Z',
}

describe('nextAvailableSlug', () => {
  it('uses -copy when nothing is taken', () => {
    expect(nextAvailableSlug('clear-cup-16oz', [])).toBe('clear-cup-16oz-copy')
  })

  it('ignores the original slug itself', () => {
    expect(nextAvailableSlug('clear-cup-16oz', ['clear-cup-16oz'])).toBe('clear-cup-16oz-copy')
  })

  it('numbers from 2 once -copy is taken', () => {
    expect(nextAvailableSlug('a', ['a', 'a-copy'])).toBe('a-copy-2')
    expect(nextAvailableSlug('a', ['a', 'a-copy', 'a-copy-2'])).toBe('a-copy-3')
  })

  it('fills the first gap rather than always appending', () => {
    expect(nextAvailableSlug('a', ['a-copy', 'a-copy-3'])).toBe('a-copy-2')
  })
})

describe('buildDuplicateInput', () => {
  const input = buildDuplicateInput(product, 'clear-cup-16oz-copy')

  it('marks the copy in its name', () => {
    expect(input.name).toBe('แก้วพลาสติกใส 16 ออนซ์ (สำเนา)')
  })

  it('lands as a draft so an unedited copy never reaches the storefront', () => {
    expect(input.status).toBe('draft')
  })

  it('clears the SKU because products.sku is unique', () => {
    expect(input.sku).toBeNull()
  })

  it('takes the caller-resolved slug', () => {
    expect(input.slug).toBe('clear-cup-16oz-copy')
  })

  it('copies pricing and wholesale fields verbatim', () => {
    expect(input.price).toBe(1290)
    expect(input.compare_at_price).toBe(1490)
    expect(input.package_unit).toBe('carton')
    expect(input.units_per_package).toBe(50)
    expect(input.min_order_quantity).toBe(3)
    expect(input.category_id).toBe('cat-1')
    expect(input.stock_quantity).toBe(40)
    expect(input.track_inventory).toBe(true)
    expect(input.sort_order).toBe(5)
    expect(input.description).toBe('แก้วพลาสติกใส')
  })

  it('never carries is_active, which the database derives', () => {
    expect('is_active' in input).toBe(false)
  })
})
