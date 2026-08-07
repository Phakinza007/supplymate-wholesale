import { describe, expect, it } from 'vitest'
import { formatPackageLabel, quantityLabel } from './wholesale'

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
