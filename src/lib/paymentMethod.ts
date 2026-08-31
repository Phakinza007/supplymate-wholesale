export type PaymentMethod = 'bank_transfer' | 'promptpay' | 'cod'

const LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'โอนผ่านธนาคาร',
  promptpay: 'พร้อมเพย์',
  cod: 'เก็บเงินปลายทาง',
}

// Falls back to the raw value rather than guessing: a method added to the DB
// but not here should be visible as unlabelled, not silently shown as a
// bank transfer.
export function paymentMethodLabel(method: string): string {
  return LABEL[method as PaymentMethod] ?? method
}
