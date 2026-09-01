/**
 * The tour, as data.
 *
 * Kept free of DOM and React so the shape of the walkthrough can be reviewed
 * and tested as content. Anchors are `data-tour` values that core components
 * carry; `stepAnchors.test.ts` fails if one of them stops existing.
 */

export type TourStepId =
  | 'home-categories'
  | 'catalogue-search'
  | 'catalogue-tiers'
  | 'tier-ladder'
  | 'quantity'
  | 'add-to-cart'
  | 'cart-summary'
  | 'payment-methods'

export interface TourStep {
  id: TourStepId
  /** Route to navigate to before showing this step; null means stay put. */
  route: string | null
  /** The `data-tour` value this step highlights. */
  anchor: string
  title: string
  body: string
  /** `action` waits for the visitor to do the thing themselves. */
  advance: 'button' | 'action'
  /**
   * Shown instead of `body` when the step found its target but not the ideal
   * one — a catalogue with no tiered product, or an add-to-cart button that is
   * disabled behind a variant choice. Without it the tour would describe
   * something the visitor is not looking at, or ask them to press a button
   * that cannot be pressed.
   */
  altBody?: string
  /**
   * Reason-specific alternatives, keyed by the target's `data-tour-blocked`
   * value, used before `altBody`. One "this is unavailable" sentence cannot
   * cover both causes: a product behind a variant choice needs a different
   * instruction from one that is simply out of stock, and telling a visitor to
   * "choose an option that is in stock" on a product with no options at all
   * sends them looking for a control that does not exist.
   */
  altBodies?: Record<string, string>
  /** Steps behind ProtectedRoute. Dropped entirely for a logged-out visitor. */
  requiresSession?: true
}

export const tourSteps: readonly TourStep[] = [
  {
    id: 'home-categories',
    route: '/',
    anchor: 'home-categories',
    title: 'ร้านนี้ขายอะไร',
    body: 'ของใช้ร้านอาหารและคาเฟ่ แบ่งตามหมวด เลือกหมวดเพื่อดูเฉพาะกลุ่มที่สนใจ',
    advance: 'button',
  },
  {
    id: 'catalogue-search',
    route: '/shop',
    anchor: 'catalogue-search',
    title: 'หาของที่ต้องการ',
    body: 'พิมพ์ชื่อสินค้าเพื่อค้นหา หรือกรองตามหมวดและการเรียงลำดับ ตัวเลือกทั้งหมดติดอยู่ใน URL แชร์หรือกดย้อนกลับได้',
    advance: 'button',
  },
  {
    id: 'catalogue-tiers',
    route: null,
    anchor: 'catalogue-tiers',
    title: 'สั่งมากขึ้น ราคาต่อหน่วยถูกลง',
    body: 'สินค้าที่มีป้ายนี้ตั้งราคาไว้เป็นขั้นตามจำนวน กดถัดไปเพื่อเข้าไปดูขั้นราคาทั้งหมด',
    altBody:
      'ตอนนี้ยังไม่มีสินค้าที่ตั้งราคาเป็นขั้นในแคตตาล็อก กดถัดไปเพื่อดูหน้าสินค้าและวิธีสั่งเป็นลัง',
    advance: 'button',
  },
  {
    id: 'tier-ladder',
    route: null,
    anchor: 'tier-ladder',
    title: 'ขั้นราคาทั้งหมดอยู่ตรงนี้',
    body: 'ระบบเลือกขั้นที่ตรงกับจำนวนในตะกร้าให้เองตอนสั่งซื้อ ไม่ต้องโทรถามหรือแจ้งพนักงาน',
    advance: 'button',
  },
  {
    id: 'quantity',
    route: null,
    anchor: 'quantity',
    title: 'ขายเป็นลัง ไม่ใช่เป็นชิ้น',
    body: 'ปรับจำนวนแล้วดูราคาต่อชิ้นขยับตาม สินค้าบางตัวมีขั้นต่ำ สั่งน้อยกว่านั้นไม่ได้',
    advance: 'button',
  },
  {
    id: 'add-to-cart',
    route: null,
    anchor: 'add-to-cart',
    title: 'ลองกดเพิ่มลงตะกร้าดู',
    body: 'กดปุ่มนี้เองได้เลย ทัวร์รอตรงนี้ก่อน — จะได้เห็นว่าตะกร้าคิดราคาขั้นบันไดให้จริง',
    altBody: 'สินค้าตัวนี้ยังกดสั่งไม่ได้ตอนนี้ กดถัดไปเพื่อดูทัวร์ต่อได้เลย',
    altBodies: {
      variant:
        'สินค้าตัวนี้ต้องเลือกตัวเลือกที่มีของก่อน เลือกแล้วกดเพิ่มลงตะกร้าได้เลย หรือกดถัดไปเพื่อดูทัวร์ต่อ',
      stock: 'สินค้าตัวนี้หมดพอดี เลยยังกดสั่งไม่ได้ กดถัดไปเพื่อดูทัวร์ต่อได้เลย',
      variants: 'ตอนนี้โหลดตัวเลือกของสินค้าไม่สำเร็จ กดถัดไปเพื่อดูทัวร์ต่อได้เลย',
    },
    advance: 'action',
  },
  {
    id: 'cart-summary',
    route: '/cart',
    anchor: 'cart-summary',
    title: 'ยอดรวมคิดจากขั้นที่ได้จริง',
    body: 'ถัดจากนี้คือเข้าสู่ระบบ เลือกที่อยู่จัดส่ง เลือกวิธีชำระเงิน แล้วแนบสลิป ระบบคิดค่าส่งและ VAT ให้ตอนสั่งซื้อ',
    // Reached with an empty cart whenever the visitor skips the add-to-cart
    // step, which the tour itself offers. The step still has to land somewhere
    // it can be read, so the empty cart carries the anchor too.
    altBody:
      'ตะกร้ายังว่างอยู่ พอมีสินค้าในตะกร้า ตรงนี้จะสรุปยอดตามขั้นราคาที่ได้จริง ถัดจากนั้นคือเข้าสู่ระบบ เลือกที่อยู่จัดส่ง เลือกวิธีชำระเงิน แล้วแนบสลิป',
    advance: 'button',
  },
  {
    id: 'payment-methods',
    route: '/checkout',
    anchor: 'payment-methods',
    title: 'เลือกวิธีชำระเงิน',
    body: 'โอนผ่านธนาคาร พร้อมเพย์ หรือเก็บเงินปลายทาง ทัวร์จบตรงนี้ ไม่กดสั่งซื้อให้',
    advance: 'button',
    requiresSession: true,
  },
]

/**
 * The sentence to show for a step, given what the tour actually found on the
 * page. A reason-specific alternative wins over the generic one, which wins
 * over the copy written for the ideal case.
 */
export function stepBody(step: TourStep, ideal: boolean, reason?: string): string {
  if (ideal) return step.body
  return (reason && step.altBodies?.[reason]) || step.altBody || step.body
}
