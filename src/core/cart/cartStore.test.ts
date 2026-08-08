import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cartStore'

const line = {
  productId: 'demo-clear-cup-16oz',
  variantId: null,
  productName: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม',
  productSlug: 'clear-cup-16oz',
  variantName: null,
  unitPrice: 1290,
  imagePath: '/images/supplymate/cups-lids.png',
  packageUnit: 'carton' as const,
  minOrderQuantity: 3,
}

describe('showcase cart', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('clamps a new line to its minimum order quantity', () => {
    useCartStore.getState().addItem(line, 1)
    expect(useCartStore.getState().items[0]?.quantity).toBe(3)
  })

  it('clamps an edited line to its minimum without deleting it', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().updateQuantity(line.productId, null, 0)
    expect(useCartStore.getState().items[0]?.quantity).toBe(3)
  })
})
