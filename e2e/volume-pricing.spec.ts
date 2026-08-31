import { test, expect } from '@playwright/test'
import { logIn, signUp, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'

test('quantity price breaks are shown, enforced by the trigger, and charged by create_order', async ({
  browser,
}) => {
  const suffix = `${Date.now()}`
  const name = `Tier Probe ${suffix}`
  const slug = `tier-probe-${suffix}`

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/products')
  await adminPage.getByRole('button', { name: 'New product' }).click()
  await adminPage.locator('#name').fill(name)
  // Let the form's blur-driven auto-slug fire and settle BEFORE writing the
  // slug, then overwrite it. Filling #slug directly after #name races that
  // handler and lands a doubled slug.
  await adminPage.locator('#name').blur()
  await adminPage.locator('#slug').fill(slug)
  await expect(adminPage.locator('#slug')).toHaveValue(slug)
  await adminPage.locator('#price').fill('1000')
  await adminPage.locator('#min_order_quantity').fill('2')
  await adminPage.locator('#stock_quantity').fill('500')
  await adminPage.locator('#status').selectOption('active')
  // Keep probe products at the end of /shop so they never become the
  // "first product" other specs buy.
  await adminPage.locator('#sort_order').fill('9000')
  await adminPage.getByRole('button', { name: 'Save product' }).click()
  await expect(adminPage.getByRole('heading', { name: 'Edit product' })).toBeVisible()

  // A tier at or below the MOQ is unreachable; the DB trigger refuses it.
  await adminPage.locator('#tier_min_quantity').fill('2')
  await adminPage.locator('#tier_unit_price').fill('900')
  await adminPage.getByRole('button', { name: 'เพิ่มขั้นราคา' }).click()
  await expect(
    adminPage.getByText(/must be greater than the product minimum order quantity/),
  ).toBeVisible()

  // A reachable tier is accepted.
  await adminPage.locator('#tier_min_quantity').fill('10')
  await adminPage.locator('#tier_unit_price').fill('900')
  await adminPage.getByRole('button', { name: 'เพิ่มขั้นราคา' }).click()
  await expect(adminPage.getByText('ตั้งแต่ 10 ขึ้นไป · ฿900.00')).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Tier Probe Customer',
    email: uniqueEmail('tier-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Tier Probe Customer',
    phone: '0891234567',
    line1: '1 Tier Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await customerPage.goto(`/products/${slug}`)
  // Below the tier: base price.
  await expect(customerPage.getByText('฿1,000.00 / 1 ลัง')).toBeVisible()
  // At the tier: the headline price drops as the quantity input changes.
  await customerPage.getByLabel('จำนวนที่สั่งซื้อ').fill('10')
  await expect(customerPage.getByText('฿900.00 / 1 ลัง')).toBeVisible()

  await customerPage.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await customerPage.getByText('เพิ่มแล้ว').waitFor()

  await customerPage.goto('/cart')
  await expect(customerPage.getByText('฿900.00 each')).toBeVisible()
  await expect(customerPage.getByText('฿9,000.00').first()).toBeVisible()

  await customerPage.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(customerPage, 'Tier Probe Co')
  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)

  // The order the server actually created must carry the tier price, not the
  // base price the client happened to display.
  await expect(customerPage.getByText('฿9,000.00').first()).toBeVisible()
  await expect(customerPage.getByText('฿10,000.00')).toHaveCount(0)

  await customerContext.close()
  await adminContext.close()
})
