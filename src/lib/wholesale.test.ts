import { describe, expect, it } from 'vitest'
import { formatPackageLabel, perItemPrice, quantityLabel } from './wholesale'

describe('wholesale labels', () => {
  it('describes cartons in Thai', () => {
    expect(formatPackageLabel('carton', 1_000)).toBe('1,000 ชิ้น / ลัง')
    expect(quantityLabel('carton', 3)).toBe('3 ลัง')
  })

  it.each([
    ['pack', 'แพ็ก'],
    ['roll', 'ม้วน'],
    ['case', 'กล่อง'],
  ] as const)('maps %s to its Thai order unit', (unit, label) => {
    expect(formatPackageLabel(unit, 50)).toBe(`50 ชิ้น / ${label}`)
    expect(quantityLabel(unit, 2)).toBe(`2 ${label}`)
  })
})

describe('wholesale per-item pricing', () => {
  it('derives the wholesale price per individual item', () => {
    expect(perItemPrice(1_290, 1_000)).toBe(1.29)
    expect(perItemPrice(890, 300)).toBeCloseTo(2.9666666667)
  })

  it('does not divide by an invalid package size', () => {
    expect(perItemPrice(890, 0)).toBe(0)
  })
})
