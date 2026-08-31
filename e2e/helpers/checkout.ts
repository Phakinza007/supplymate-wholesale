import type { Page } from '@playwright/test'

export async function fillBusinessDetails(
  page: Page,
  businessName = 'SupplyMate Test Café',
): Promise<void> {
  await page.getByRole('textbox', { name: 'ชื่อร้านหรือบริษัท' }).fill(businessName)
}

export async function addAddress(
  page: Page,
  opts: { recipientName: string; phone: string; line1: string; province: string; postalCode: string },
): Promise<void> {
  await page.goto('/account/addresses')
  await page.getByRole('button', { name: 'เพิ่มที่อยู่' }).click()
  await page.locator('#recipient_name').fill(opts.recipientName)
  await page.locator('#phone').fill(opts.phone)
  await page.locator('#line1').fill(opts.line1)
  await page.locator('#province').fill(opts.province)
  await page.locator('#postal_code').fill(opts.postalCode)
  await page.getByRole('button', { name: 'บันทึกที่อยู่' }).click()
  await page.getByText(opts.recipientName).waitFor()
}

export async function buyFirstProductAndUploadSlip(
  page: Page,
  slipPath: string,
  businessName = 'Golden Path Business',
): Promise<{ orderUrl: string; orderNumber: string }> {
  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByText('เพิ่มแล้ว').waitFor()

  await page.goto('/cart')
  await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(page, businessName)
  await page.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await page.waitForURL(/\/orders\/.+/)

  // Return the bare order number, not the whole heading: the customer page and
  // the admin list word their headings differently (and in different
  // languages), but both contain this identifier.
  const heading = (await page.getByRole('heading', { name: /#/ }).textContent())!.trim()
  const orderNumber = heading.split('#')[1]!.trim()

  await page.locator('input[type="file"]').setInputFiles(slipPath)
  await page.getByRole('button', { name: 'แนบสลิปการโอน' }).click()
  await page.getByText('ได้รับสลิปแล้ว').waitFor()

  return { orderUrl: page.url(), orderNumber }
}
