import { describe, expect, it } from 'vitest'
import { tourSteps } from './tourSteps'
import { planSteps, progressLabel } from './stepSequence'

describe('planSteps', () => {
  it('drops the checkout tail for a visitor with no session', () => {
    const plan = planSteps(tourSteps, { hasSession: false })
    expect(plan.some((s) => s.requiresSession)).toBe(false)
    expect(plan.at(-1)?.id).toBe('cart-summary')
  })

  it('keeps the checkout tail for a signed-in visitor', () => {
    const plan = planSteps(tourSteps, { hasSession: true })
    expect(plan.at(-1)?.id).toBe('payment-methods')
  })

  it('leaves the shared steps identical either way', () => {
    const out = planSteps(tourSteps, { hasSession: false }).map((s) => s.id)
    const inn = planSteps(tourSteps, { hasSession: true }).map((s) => s.id)
    expect(inn.slice(0, out.length)).toEqual(out)
  })
})

describe('the step data itself', () => {
  it('starts on the home page', () => {
    expect(tourSteps[0].route).toBe('/')
  })

  it('waits for a real click on the add-to-cart step and nowhere else', () => {
    // The tour must never press a data-changing control itself. The only step
    // that involves one is the step that waits for the visitor.
    const waiting = tourSteps.filter((s) => s.advance === 'action').map((s) => s.id)
    expect(waiting).toEqual(['add-to-cart'])
  })

  it('gives every step a distinct id and anchor', () => {
    expect(new Set(tourSteps.map((s) => s.id)).size).toBe(tourSteps.length)
    expect(new Set(tourSteps.map((s) => s.anchor)).size).toBe(tourSteps.length)
  })
})

describe('progressLabel', () => {
  it('counts against the planned length, not the full list', () => {
    // A logged-out visitor sees "3 จาก 7", never "3 จาก 8" for a step they
    // will never reach.
    expect(progressLabel(2, 7)).toBe('ขั้นที่ 3 จาก 7')
  })
})
