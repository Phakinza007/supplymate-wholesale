export const ORDER_STATUS_VALUES = ['pending', 'verified', 'shipped', 'done', 'cancelled'] as const

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number]

const THAI_LABEL: Record<OrderStatusValue, string> = {
  pending: 'รอตรวจสอบการชำระเงิน',
  verified: 'ตรวจสอบการชำระเงินแล้ว',
  shipped: 'จัดส่งแล้ว',
  done: 'คำสั่งซื้อเสร็จสมบูรณ์',
  cancelled: 'ยกเลิกคำสั่งซื้อ',
}

/** Short form for chips and table cells, where the sentence-length label wraps. */
const THAI_SHORT_LABEL: Record<OrderStatusValue, string> = {
  pending: 'รอตรวจสอบ',
  verified: 'ตรวจสอบแล้ว',
  shipped: 'จัดส่งแล้ว',
  done: 'เสร็จสมบูรณ์',
  cancelled: 'ยกเลิก',
}

export function orderStatusLabel(status: string, form: 'long' | 'short' = 'long'): string {
  const map = form === 'short' ? THAI_SHORT_LABEL : THAI_LABEL
  return map[status as OrderStatusValue] ?? status
}

/**
 * Maps a status onto a Badge tone. Kept next to the labels rather than inside
 * the Badge so the primitive stays domain-free — product status and any future
 * status vocabulary map themselves the same way.
 */
export function orderStatusTone(status: string) {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(status)
    ? (status as OrderStatusValue)
    : ('neutral' as const)
}
