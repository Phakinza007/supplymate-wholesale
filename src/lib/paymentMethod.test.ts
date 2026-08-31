import { describe, expect, it } from 'vitest'
import { paymentMethodLabel } from './paymentMethod'

describe('paymentMethodLabel', () => {
  it('labels every method the schema allows', () => {
    expect(paymentMethodLabel('bank_transfer')).toBe('โอนผ่านธนาคาร')
    expect(paymentMethodLabel('promptpay')).toBe('พร้อมเพย์')
    expect(paymentMethodLabel('cod')).toBe('เก็บเงินปลายทาง')
  })

  it('shows an unknown method as itself rather than mislabelling it', () => {
    // Deliberately not a method the schema accepts: the point is that a value
    // added to the database but not here shows up as unlabelled rather than
    // silently reading as a bank transfer. `cod` used to stand in for this
    // and stopped being unknown the moment COD shipped.
    expect(paymentMethodLabel('installments')).toBe('installments')
  })
})
