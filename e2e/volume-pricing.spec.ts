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
  await adminPage.getByRole('button', { name: '+ เพิ่มสินค้า' }).click()
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
  await adminPage.getByRole('button', { name: 'บันทึกสินค้า' }).click()
  await expect(adminPage.getByRole('heading', { name: 'แก้ไขสินค้า' })).toBeVisible()

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
  await expect(customerPage.getByText('฿900.00 ต่อหน่วย')).toBeVisible()
  await expect(customerPage.getByText('฿9,000.00').first()).toBeVisible()

  await customerPage.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(customerPage, 'Tier Probe Co')
  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)

  // The order the server actually created must carry the tier price, not the
  // base price the client happened to display. Asserted on the named rows
  // rather than "the first ฿9,000.00 anywhere", so the goods total and the
  // amount charged are checked as the distinct figures they are.
  //
  // 10 x ฿900 = ฿9,000 goods, free delivery over ฿1,000, VAT 7% = ฿630.
  // Each figure is asserted on its own summary row. ฿9,000.00 legitimately
  // appears twice — once as the line total, once as the goods subtotal — so a
  // bare getByText would be ambiguous and would not prove which row is which.
  const summaryRow = (label: string) => customerPage.getByText(label).locator('..')
  await expect(summaryRow('ยอดรวมสินค้า')).toContainText('฿9,000.00')
  await expect(summaryRow('ภาษีมูลค่าเพิ่ม 7%')).toContainText('฿630.00')
  await expect(summaryRow('ยอดรวมทั้งสิ้น')).toContainText('฿9,630.00')
  // Never the undiscounted base price, with or without tax on top.
  await expect(customerPage.getByText('฿10,000.00')).toHaveCount(0)
  await expect(customerPage.getByText('฿10,700.00')).toHaveCount(0)

  await customerContext.close()
  await adminContext.close()
})

test('the ladder is labelled in the product\'s own unit, not always in ลัง', async ({ page }) => {
  // Every seeded product is sold by the ลัง, which is exactly why the ladder's
  // "per package" column header sat hardcoded as "ต่อลัง" for as long as it
  // did. A product sold by the แพ็ก is the only thing that catches it.
  const suffix = `${Date.now()}`
  const slug = `pack-unit-probe-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })
  await page.goto('/admin/products')
  await page.getByRole('button', { name: '+ เพิ่มสินค้า' }).click()
  await page.locator('#name').fill(`Pack Unit Probe ${suffix}`)
  await page.locator('#name').blur()
  await page.locator('#slug').fill(slug)
  await expect(page.locator('#slug')).toHaveValue(slug)
  await page.locator('#package_unit').selectOption('pack')
  await page.locator('#price').fill('500')
  await page.locator('#stock_quantity').fill('100')
  await page.locator('#status').selectOption('active')
  await page.locator('#sort_order').fill('9001')
  await page.getByRole('button', { name: 'บันทึกสินค้า' }).click()
  await expect(page.getByRole('heading', { name: 'แก้ไขสินค้า' })).toBeVisible()

  await page.locator('#tier_min_quantity').fill('10')
  await page.locator('#tier_unit_price').fill('450')
  await page.getByRole('button', { name: 'เพิ่มขั้นราคา' }).click()
  await expect(page.getByText('ตั้งแต่ 10 ขึ้นไป · ฿450.00')).toBeVisible()

  await page.goto(`/products/${slug}`)
  const ladder = page.getByRole('table')
  await expect(ladder.getByRole('columnheader', { name: 'จำนวน (แพ็ก)' })).toBeVisible()
  await expect(ladder.getByRole('columnheader', { name: 'ต่อแพ็ก' })).toBeVisible()
  await expect(ladder.getByRole('columnheader', { name: 'ต่อลัง' })).toHaveCount(0)
})
