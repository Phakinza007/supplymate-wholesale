import { test, expect } from '@playwright/test'
import { signUp, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'
import { brandConfig } from '../src/config/branding.config'

// An empty qrImageUrl is the documented off switch: a shop without a QR never
// offers the method, so there is nothing here to test.
test.skip(
  brandConfig.promptPay.qrImageUrl === '',
  'PromptPay is not configured for this client',
)

test('a PromptPay order records the method and shows the static QR with the amount', async ({
  page,
}) => {
  await signUp(page, {
    fullName: 'PromptPay Buyer',
    email: uniqueEmail('promptpay-buyer'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'PromptPay Buyer',
    phone: '0891234567',
    line1: '9 QR Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByText('เพิ่มแล้ว').waitFor()

  await page.goto('/cart')
  await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(page, 'PromptPay Co')

  // Bank transfer leads; PromptPay is a deliberate choice.
  const promptPay = page.getByRole('radio', { name: /พร้อมเพย์/ })
  await expect(page.getByRole('radio', { name: /โอนผ่านธนาคาร/ })).toBeChecked()
  await promptPay.check()

  await page.getByRole('button', { name: 'สั่งซื้อ', exact: true }).click()
  await page.waitForURL(/\/orders\/.+/)

  // The order page must show the QR, and — because a static QR carries no
  // amount — state the amount beside it so the buyer can type it in.
  await expect(page.getByRole('heading', { name: 'ชำระเงินด้วยพร้อมเพย์' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR พร้อมเพย์ของร้าน' })).toBeVisible()
  await expect(page.getByText('QR นี้ไม่ได้ผูกยอด')).toBeVisible()
  await expect(page.getByText(brandConfig.promptPay.promptPayId)).toBeVisible()

  // Bank details belong to the other method and must not also be on screen.
  await expect(page.getByText(brandConfig.bankTransfer.accountNumber)).toHaveCount(0)

  // The slip flow is unchanged: PromptPay ends in the same manual check.
  await expect(page.getByRole('button', { name: 'แนบสลิปการโอน' })).toBeVisible()

  await page.goto('/orders')
  await expect(page.getByText('พร้อมเพย์')).toBeVisible()
})
