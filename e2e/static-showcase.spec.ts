import { expect, test } from '@playwright/test'

test('keeps the B2B catalogue journey usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const consoleErrors: string[] = []
  const resourceErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('response', response => {
    if (new URL(response.url()).origin === 'http://localhost:5174' && response.status() >= 400) {
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
  await expect(page.getByRole('heading', { name: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม' })).toBeVisible()

  const layout = await page.evaluate(() => ({
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  expect(layout.canScrollX).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(resourceErrors).toEqual([])
})

test('keeps MOQ, the cart summary, and simulated confirmation intact', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/products/blank-label-roll-50x30')
  const quantity = page.getByRole('spinbutton', { name: 'จำนวน' })
  await expect(quantity).toHaveValue('3')
  await quantity.fill('1')
  await expect(quantity).toHaveValue('3')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByRole('link', { name: /ตะกร้า/ }).click()
  await expect(page.getByText('ยอดรวมสินค้า')).toBeVisible()
  await page.getByRole('link', { name: 'ไปยังการสั่งซื้อจำลอง' }).click()
  await page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อจำลอง' }).click()
  await expect(page.getByRole('heading', { name: 'บันทึกการสาธิตแล้ว' })).toBeVisible()
  await expect(page.getByText('ไม่มีการส่งหรือบันทึกคำสั่งซื้อ การชำระเงิน หรือข้อมูลลูกค้า')).toBeVisible()
})
