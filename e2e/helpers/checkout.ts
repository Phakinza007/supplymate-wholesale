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
  await page.getByRole('button', { name: 'Add address' }).click()
  await page.locator('#recipient_name').fill(opts.recipientName)
  await page.locator('#phone').fill(opts.phone)
  await page.locator('#line1').fill(opts.line1)
  await page.locator('#province').fill(opts.province)
  await page.locator('#postal_code').fill(opts.postalCode)
  await page.getByRole('button', { name: 'Save address' }).click()
  await page.getByText(opts.recipientName).waitFor()
}

export async function buyFirstProductAndUploadSlip(
  page: Page,
  slipPath: string,
  businessName = 'Golden Path Business',
): Promise<{ orderUrl: string; orderHeading: string }> {
  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await page.getByText('Added ✓').waitFor()

  await page.goto('/cart')
  await page.getByRole('link', { name: 'Proceed to checkout' }).click()
  await fillBusinessDetails(page, businessName)
  await page.getByRole('button', { name: 'Place order' }).click()
  await page.waitForURL(/\/orders\/.+/)

  const orderHeading = (await page.getByRole('heading', { name: /^Order #/ }).textContent())!.trim()

  await page.locator('input[type="file"]').setInputFiles(slipPath)
  await page.getByRole('button', { name: 'Upload payment slip' }).click()
  await page.getByText("Payment slip received").waitFor()

  return { orderUrl: page.url(), orderHeading }
}
