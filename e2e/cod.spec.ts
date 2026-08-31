import { test, expect } from '@playwright/test'
import { signUp, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'
import { brandConfig } from '../src/config/branding.config'

test.skip(!brandConfig.cod.enabled, 'COD is not offered by this client')

test('a COD order adds the fee, taxes it, and never asks for a slip', async ({ page }) => {
  await signUp(page, {
    fullName: 'COD Buyer',
    email: uniqueEmail('cod-buyer'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'COD Buyer',
    phone: '0891234567',
    line1: '7 Doorstep Road',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByText('เพิ่มแล้ว').waitFor()

  await page.goto('/cart')
  await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(page, 'COD Co')

  await page.getByRole('radio', { name: /เก็บเงินปลายทาง/ }).check()
  await page.getByRole('button', { name: 'สั่งซื้อ', exact: true }).click()
  await page.waitForURL(/\/orders\/.+/)

  // The fee is a line of its own, not folded into delivery — a buyer who
  // cannot see why the total moved will call the shop about it.
  //
  // Matched on the row's whole text, because the COD panel below also spells
  // out the same phrase in prose; a bare getByText would hit both.
  const summaryRow = (label: string) =>
    page.locator('div').filter({ hasText: new RegExp(`^${label}฿[\\d,]+\\.\\d{2}$`) })
  await expect(summaryRow('ค่าบริการเก็บเงินปลายทาง')).toContainText(
    `฿${brandConfig.cod.fee.toFixed(2)}`,
  )

  // Nothing is paid in advance, so the slip form must be absent entirely —
  // not merely unused. Uploading one would be a lie about a COD order.
  await expect(page.getByRole('heading', { name: 'ชำระเงินปลายทาง' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'แนบสลิปการโอน' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'ชำระเงินด้วยการโอน' })).toHaveCount(0)

  await page.goto('/orders')
  await expect(page.getByText('เก็บเงินปลายทาง').first()).toBeVisible()
})

test('the COD fee is taxed with everything else, not added after tax', async ({ page }) => {
  await signUp(page, {
    fullName: 'COD Maths',
    email: uniqueEmail('cod-maths'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'COD Maths',
    phone: '0891234567',
    line1: '8 Doorstep Road',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByText('เพิ่มแล้ว').waitFor()
  await page.goto('/cart')
  await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(page, 'COD Maths Co')
  await page.getByRole('radio', { name: /เก็บเงินปลายทาง/ }).check()
  await page.getByRole('button', { name: 'สั่งซื้อ', exact: true }).click()
  await page.waitForURL(/\/orders\/.+/)

  // Read the rendered figures back and check the identity the database
  // enforces: goods - discount + delivery + COD fee + VAT = total, with VAT
  // computed on a base that already includes the fee.
  // Anchored on the full row text for the same reason as above: several of
  // these labels also appear in surrounding prose.
  const money = async (label: string) => {
    const row = page.locator('div').filter({ hasText: new RegExp(`^${label}฿[\\d,]+\\.\\d{2}$`) })
    const text = (await row.first().textContent()) ?? ''
    const match = text.match(/฿([\d,]+\.\d{2})/)
    return Number((match?.[1] ?? '0').replace(/,/g, ''))
  }
  const goods = await money('ยอดรวมสินค้า')
  const delivery = await money('ค่าจัดส่ง')
  const codFee = await money('ค่าบริการเก็บเงินปลายทาง')
  const vat = await money('ภาษีมูลค่าเพิ่ม 7%')
  const total = await money('ยอดรวมทั้งสิ้น')

  expect(codFee).toBe(brandConfig.cod.fee)
  expect(vat).toBeCloseTo(Number(((goods + delivery + codFee) * 0.07).toFixed(2)), 2)
  expect(total).toBeCloseTo(goods + delivery + codFee + vat, 2)
})
