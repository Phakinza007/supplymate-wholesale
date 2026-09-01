import { expect, test } from '@playwright/test'

test('keeps the B2B catalogue journey usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const consoleErrors: string[] = []
  const resourceErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('response', response => {
    // Own-origin only: the Google Fonts stylesheet lives elsewhere and its
    // availability is not what this spec is testing.
    if (new URL(response.url()).origin === new URL(page.url()).origin && response.status() >= 400) {
      resourceErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/#/')
  await expect(
    page.locator('main [role="note"]').filter({ hasText: 'Concept demo — ไม่รับคำสั่งซื้อจริง' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'แคตตาล็อกค้าส่งสำหรับร้านอาหาร คาเฟ่ และครัวกลาง',
  )
  await expect(page.getByRole('main')).not.toContainText('ส่งตรงถึงร้าน')
  await page.getByRole('link', { name: 'เลือกดูแคตตาล็อก' }).click()
  await expect(page).toHaveURL(/#\/shop/)
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).fill('แก้ว')
  await expect(page.getByRole('heading', { name: 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม' })).toBeVisible()

  const layout = await page.evaluate(() => ({
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  expect(layout.canScrollX).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(resourceErrors).toEqual([])
})

test('keeps MOQ, the cart summary, and simulated confirmation intact', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/products/thermal-label-50x30')
  const quantity = page.getByRole('spinbutton', { name: 'จำนวน' })
  await expect(quantity).toHaveValue('6')
  await quantity.fill('1')
  await expect(quantity).toHaveValue('6')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  // Scoped to the header: the detail page now also offers a "ดูตะกร้า" shortcut
  // right after adding.
  await page.getByRole('banner').getByRole('link', { name: /ตะกร้า/ }).click()
  await expect(page.getByText('ยอดรวมสินค้า')).toBeVisible()
  await page.getByRole('link', { name: 'ไปยังการสั่งซื้อจำลอง' }).click()
  await page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อจำลอง' }).click()
  await expect(page.getByRole('heading', { name: 'บันทึกการสาธิตแล้ว' })).toBeVisible()
  await expect(page.getByText('ไม่มีการส่งหรือบันทึกคำสั่งซื้อ การชำระเงิน หรือข้อมูลลูกค้า')).toBeVisible()
})

test('curates the home page and offers the rest of the catalogue', async ({ page }) => {
  await page.goto('/#/')

  const featured = page.getByRole('region', { name: 'ตัวอย่างจากทุกหมวด' })
  await expect(featured.locator('.wholesale-product-card')).toHaveCount(6)
  await featured.getByRole('link', { name: /ดูสินค้าทั้งหมด 36 รายการ/ }).click()

  await expect(page).toHaveURL(/#\/shop/)
  await expect(page.getByText('พบสินค้า 36 รายการ')).toBeVisible()
  await page.getByRole('button', { name: 'อุปกรณ์บาร์' }).click()
  await expect(page.getByText('พบสินค้า 6 รายการ')).toBeVisible()
})

test('shows the product code and a way into the rest of the category', async ({ page }) => {
  await page.goto('/#/products/milk-pitcher-600ml')
  await expect(page.getByText('SM-BAR-PITCHER-600')).toBeVisible()

  const related = page.getByRole('region', { name: 'สินค้าอื่นในหมวดอุปกรณ์บาร์' })
  await expect(related.locator('.wholesale-product-card')).toHaveCount(3)
  await related.getByRole('link', { name: 'เชคเกอร์สเตนเลส' }).click()
  await expect(page).toHaveURL(/#\/products\/cocktail-shaker/)
})
