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

describe('reconcilePricing', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('replaces the cached unit price on the matching line only', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().addItem({ ...line, productId: 'other', productSlug: 'other' }, 3)

    useCartStore.getState().reconcilePricing(line.productId, null, 1200)

    const items = useCartStore.getState().items
    expect(items.find((i) => i.productId === line.productId)?.unitPrice).toBe(1200)
    expect(items.find((i) => i.productId === 'other')?.unitPrice).toBe(1290)
  })

  it('feeds the recomputed subtotal', () => {
    useCartStore.getState().addItem(line, 10)
    useCartStore.getState().reconcilePricing(line.productId, null, 1200)

    const subtotal = useCartStore
      .getState()
      .items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    expect(subtotal).toBe(12_000)
  })

  it('ignores a line that is not in the cart', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().reconcilePricing('not-in-cart', null, 1)
    expect(useCartStore.getState().items[0]?.unitPrice).toBe(1290)
  })
})
