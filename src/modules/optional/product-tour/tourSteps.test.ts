import { describe, expect, it } from 'vitest'
import { stepBody, tourSteps } from './tourSteps'

const addToCart = tourSteps.find((step) => step.id === 'add-to-cart')!
const cartSummary = tourSteps.find((step) => step.id === 'cart-summary')!

describe('stepBody', () => {
  it('uses the written copy when the step found what it wanted', () => {
    expect(stepBody(addToCart, true, undefined)).toBe(addToCart.body)
  })

  it('explains the actual reason the button cannot be pressed', () => {
    // One sentence cannot cover both: telling someone to "choose an option
    // that is in stock" on a product with no options sends them looking for a
    // control that does not exist.
    const variant = stepBody(addToCart, false, 'variant')
    const stock = stepBody(addToCart, false, 'stock')
    expect(variant).toContain('เลือกตัวเลือก')
    expect(stock).toContain('หมด')
    expect(stock).not.toContain('เลือกตัวเลือก')
  })

  it('falls back to the generic alternative when the page gives no reason', () => {
    expect(stepBody(addToCart, false, undefined)).toBe(addToCart.altBody)
    expect(stepBody(addToCart, false, 'something-new')).toBe(addToCart.altBody)
  })

  it('tells the truth about an empty cart on the closing step', () => {
    expect(stepBody(cartSummary, true, undefined)).toBe(cartSummary.body)
    expect(stepBody(cartSummary, false, undefined)).toContain('ตะกร้ายังว่างอยู่')
  })

  it('never leaves a step without something to say', () => {
    for (const step of tourSteps) {
      expect(stepBody(step, false, 'unknown-reason').length).toBeGreaterThan(0)
    }
  })
})
