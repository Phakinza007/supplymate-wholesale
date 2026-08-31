import { describe, expect, it } from 'vitest'
import { PRODUCT_STATUSES, productStatusLabel } from './productStatus'

describe('productStatusLabel', () => {
  it('labels every known status in Thai', () => {
    expect(productStatusLabel('draft')).toBe('แบบร่าง')
    expect(productStatusLabel('active')).toBe('เปิดขาย')
    expect(productStatusLabel('archived')).toBe('เลิกขาย')
  })

  it('falls back to the raw value for an unknown status', () => {
    expect(productStatusLabel('something-else')).toBe('something-else')
  })

  it('exposes the three statuses in lifecycle order', () => {
    expect(PRODUCT_STATUSES).toEqual(['draft', 'active', 'archived'])
  })
})
