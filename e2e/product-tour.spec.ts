import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'

test.skip(!brandConfig.features.productTour, 'the product tour is off for this client')

const dialog = 'role=dialog'

test('a visitor with no account can take the whole tour', async ({ page }) => {
  await page.goto('/')
  const tour = page.getByRole('dialog')
  await expect(tour).toBeVisible()
  await expect(tour).toContainText('ร้านนี้ขายอะไร')

  // Logged out, so the checkout tail is not in the plan at all: a visitor is
  // never counted towards a step they cannot reach.
  await expect(tour).toContainText('ขั้นที่ 1 จาก 7')

  await tour.getByRole('button', { name: /^ถัดไป/ }).click()
  await expect(page).toHaveURL(/\/shop/)
  await expect(tour).toContainText('หาของที่ต้องการ')

  // Steps whose anchor never appears are skipped rather than waited on, so the
  // walk is "press ถัดไป until the tour stops offering it" rather than a fixed
  // count -- a catalogue without price tiers legitimately has fewer steps.
  for (let i = 0; i < 6; i++) {
    if (await tour.getByRole('button', { name: /^ข้าม/ }).isVisible()) break
    if (!(await tour.getByRole('button', { name: /^ถัดไป/ }).isVisible())) break
    await tour.getByRole('button', { name: /^ถัดไป/ }).click()
    await page.waitForTimeout(300)
  }

  // The waiting step: the tour asks, the visitor acts. It must be possible to
  // press the real button while the overlay is up -- the dim is four bands
  // around the target, not a sheet over it.
  await expect(tour).toContainText('ลองกดเพิ่มลงตะกร้าดู')
  await expect(page).toHaveURL(/\/products\//)
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()

  await expect(page).toHaveURL(/\/cart/)
  await expect(tour).toContainText('ยอดรวมคิดจากขั้นที่ได้จริง')

  await tour.getByRole('button', { name: /^จบทัวร์/ }).click()
  await expect(page.locator(dialog)).toHaveCount(0)

  // The rule the whole design hangs on: the tour navigates and highlights, and
  // never presses a control that changes data. Nothing was ordered.
  await expect(page).not.toHaveURL(/\/orders\//)
})

test('escape closes the tour, and it does not come back uninvited', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator(dialog)).toHaveCount(0)

  await page.reload()
  await expect(page.locator(dialog)).toHaveCount(0)

  // But it is always available again on request.
  await page.getByRole('button', { name: 'ดูวิธีสั่งซื้อ' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a deep link is never hijacked into the tour', async ({ page }) => {
  // Someone opening a shared cart URL must not be yanked back to the home page.
  await page.goto('/cart')
  await expect(page.locator(dialog)).toHaveCount(0)
  await expect(page).toHaveURL(/\/cart/)
})

test('a highlighted link is not click-through on a step that is not waiting', async ({ page }) => {
  // The spotlight hole exists for one step: the one that asks the visitor to
  // press add-to-cart. Leaving it open on every step let a raw click land on a
  // highlighted link and navigate away, stranding the tour on a step whose
  // target was no longer on the page. Raw mouse click, not locator.click(),
  // because Playwright's actionability check would refuse it -- and refusing is
  // exactly the behaviour under test.
  await page.goto('/')
  const tour = page.getByRole('dialog')
  await expect(tour).toBeVisible()

  const link = page.locator('a[href^="/shop?category="]').first()
  await expect(link).toBeVisible()
  const box = await link.boundingBox()
  if (!box) throw new Error('no category link to aim at')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(page).toHaveURL(/\/$|\/\?/)
})

test('the highlight is a highlight, not the whole page', async ({ page }) => {
  // The first step's anchor is a block of category tiles, which on a phone is
  // taller than the screen. Highlighting all of it dims a few pixels at the
  // edges and reads as "nothing is highlighted", so the overlay draws only the
  // part the visitor can see.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const tour = page.getByRole('dialog')
  await expect(tour).toBeVisible()

  const ring = page.locator('[data-tour-overlay] .ring-2')
  await expect(ring).toBeVisible()
  const box = await ring.boundingBox()
  if (!box) throw new Error('no highlight drawn')
  // Entirely on screen: an outline whose top and bottom are both off the
  // viewport is not showing the visitor anything.
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(813)
})

test('skipping the add-to-cart step still ends somewhere readable', async ({ page }) => {
  // "ข้าม" is a button the tour itself offers on the waiting step. Taking it
  // arrives at /cart with an empty cart, where the summary the closing step
  // describes does not exist -- which used to render a black screen that closed
  // itself about two seconds later, before the closing sentence could be read.
  await page.goto('/')
  const tour = page.getByRole('dialog')
  await expect(tour).toBeVisible()

  for (let i = 0; i < 8; i++) {
    if (await tour.getByRole('button', { name: /^ข้าม/ }).isVisible()) break
    if (!(await tour.getByRole('button', { name: /^ถัดไป/ }).isVisible())) break
    await tour.getByRole('button', { name: /^ถัดไป/ }).click()
    await page.waitForTimeout(300)
  }
  await tour.getByRole('button', { name: /^ข้าม/ }).click()

  await expect(page).toHaveURL(/\/cart/)
  await expect(tour).toContainText('ตะกร้ายังว่างอยู่')

  // It stays put: the visitor closes the tour, the tour does not close itself.
  await page.waitForTimeout(3000)
  await expect(tour).toBeVisible()
  await tour.getByRole('button', { name: /^จบทัวร์/ }).click()
  await expect(page.locator(dialog)).toHaveCount(0)
})
