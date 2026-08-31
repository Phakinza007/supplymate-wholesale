import { describe, expect, it } from 'vitest'
import { paymentMethodLabel } from './paymentMethod'

describe('paymentMethodLabel', () => {
  it('labels the methods the schema allows', () => {
    expect(paymentMethodLabel('bank_transfer')).toBe('โอนผ่านธนาคาร')
    expect(paymentMethodLabel('promptpay')).toBe('พร้อมเพย์')
  })

  it('shows an unknown method as itself rather than mislabelling it', () => {
    expect(paymentMethodLabel('cod')).toBe('cod')
  })
})
