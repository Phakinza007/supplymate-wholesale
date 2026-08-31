import { describe, expect, it } from 'vitest'
import { tooltipPosition } from './tooltipPosition'

const desktop = { width: 1280, height: 800 }
const tooltip = { width: 320, height: 160 }
const base = { tooltip, viewport: desktop, headerHeight: 64, gap: 12 }

describe('tooltipPosition', () => {
  it('sits below the target when there is room', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 500, width: 200, height: 50 } })
    expect(r.placement).toBe('bottom')
    expect(r.top).toBe(162) // target bottom (150) + gap
  })

  it('flips above when the target is near the bottom edge', () => {
    const r = tooltipPosition({ ...base, target: { top: 700, left: 500, width: 200, height: 50 } })
    expect(r.placement).toBe('top')
    expect(r.top).toBe(528) // target top (700) - gap - tooltip height
  })

  it('never rides up under the sticky header', () => {
    // Target hugs the top, so "above" would land at a negative offset.
    const r = tooltipPosition({ ...base, target: { top: 70, left: 500, width: 200, height: 700 } })
    expect(r.top).toBeGreaterThanOrEqual(base.headerHeight + base.gap)
  })

  it('clamps against the right edge instead of overflowing', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 1200, width: 60, height: 50 } })
    expect(r.left).toBe(desktop.width - tooltip.width - base.gap)
  })

  it('clamps against the left edge instead of going negative', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 4, width: 40, height: 50 } })
    expect(r.left).toBe(base.gap)
  })

  it('becomes a bottom sheet on a phone regardless of the target', () => {
    const r = tooltipPosition({
      ...base,
      viewport: { width: 375, height: 812 },
      target: { top: 300, left: 20, width: 300, height: 50 },
    })
    expect(r.placement).toBe('sheet')
    expect(r.left).toBe(0)
    expect(r.top).toBe(812 - tooltip.height)
  })
})
