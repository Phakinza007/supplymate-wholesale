export type ProductStatus = 'draft' | 'active' | 'archived'

// Lifecycle order: still being entered -> on sale -> withdrawn.
export const PRODUCT_STATUSES: readonly ProductStatus[] = ['draft', 'active', 'archived']

const THAI_LABEL: Record<ProductStatus, string> = {
  draft: 'แบบร่าง',
  active: 'เปิดขาย',
  archived: 'เลิกขาย',
}

export function productStatusLabel(status: string): string {
  return THAI_LABEL[status as ProductStatus] ?? status
}
