import { expect, test } from '@playwright/test'
import { signUp, uniqueEmail } from './helpers/auth'
import { addAddress } from './helpers/checkout'

test('shows wholesale pack truth and enforces the product minimum', async ({ page }) => {
  await page.goto('/products/clear-cup-16oz')

  await expect(page.getByText('1,000 ชิ้น / ลัง')).toBeVisible()
  const quantity = page.getByRole('spinbutton', { name: 'จำนวนที่สั่งซื้อ' })
  await expect(quantity).toHaveValue('1')
  await quantity.fill('0')
  await expect(quantity).toHaveValue('1')

  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText('Added ✓')).toBeVisible()
  await page.goto('/cart')
  await expect(page.getByText('1 ลัง')).toBeVisible()
})

test('enforces a larger MOQ again in the cart', async ({ page }) => {
  await page.goto('/products/thermal-label-50x30')

  const detailQuantity = page.getByRole('spinbutton', { name: 'จำนวนที่สั่งซื้อ' })
  await expect(detailQuantity).toHaveValue('6')
  await detailQuantity.fill('1')
  await expect(detailQuantity).toHaveValue('6')
  await page.getByRole('button', { name: 'Add to cart' }).click()

  await page.goto('/cart')
  const cartQuantity = page.getByRole('spinbutton', {
    name: 'จำนวน ฉลากความร้อน 50 × 30 มม.',
  })
  await expect(cartQuantity).toHaveAttribute('min', '6')
  await expect(cartQuantity).toHaveValue('6')
  await cartQuantity.fill('1')
  await expect(cartQuantity).toHaveValue('6')
})

test('keeps snapshotted pack truth but blocks checkout when a product disappears', async ({
  page,
}) => {
  await page.goto('/products/clear-cup-16oz')
  await page.getByRole('button', { name: 'Add to cart' }).click()

  await page.route(/\/rest\/v1\/products\?/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/cart')

  await expect(page.getByText('1 ลัง')).toBeVisible()
  await expect(page.getByText('สินค้านี้ไม่พร้อมจำหน่ายแล้ว')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Proceed to checkout' })).toBeDisabled()
})

test('does not offer a tracked product when stock is below its MOQ', async ({ page }) => {
  await page.route(/\/rest\/v1\/products\?/, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as Record<string, unknown> | Record<string, unknown>[]
    const withLowStock = (product: Record<string, unknown>) => ({
      ...product,
      stock_quantity: 5,
    })

    await route.fulfill({
      response,
      json: Array.isArray(body) ? body.map(withLowStock) : withLowStock(body),
    })
  })
  await page.goto('/products/thermal-label-50x30')

  await expect(page.getByRole('spinbutton', { name: 'จำนวนที่สั่งซื้อ' })).toHaveAttribute(
    'max',
    '5',
  )
  await expect(page.getByRole('button', { name: 'Out of stock' })).toBeDisabled()
})

test('starts a B2B buyer in the catalogue', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'ของใช้ร้านอาหารและคาเฟ่ สั่งเป็นลัง ส่งตรงถึงร้าน',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'เลือกสินค้าตามหมวด' }).click()
  await expect(page).toHaveURL(/\/shop/)
  await expect(page.getByRole('searchbox', { name: 'ค้นหาสินค้า' })).toBeVisible()
})

test('records business checkout details in the buyer order snapshot', async ({ page }) => {
  await page.goto('/products/clear-cup-16oz')
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByText('Added ✓')).toBeVisible()

  await signUp(page, {
    fullName: 'SupplyMate Buyer',
    email: uniqueEmail('supplymate-business'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'SupplyMate Buyer',
    phone: '0891234567',
    line1: '88 Riverside Road',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await page.goto('/checkout')
  const businessFields = page.getByRole('group', { name: 'ข้อมูลสำหรับธุรกิจ' })
  await expect(businessFields).toBeVisible()
  await expect(businessFields.getByRole('textbox', { name: 'ชื่อร้านหรือบริษัท' })).toBeVisible()
  await expect(
    businessFields.getByRole('textbox', { name: 'เลขประจำตัวผู้เสียภาษี' }),
  ).toBeVisible()
  await expect(businessFields.getByRole('textbox', { name: 'สาขา' })).toBeVisible()

  const submit = page.getByRole('button', { name: 'Place order' })
  await expect(submit).toBeDisabled()
  await businessFields
    .getByRole('textbox', { name: 'เลขประจำตัวผู้เสียภาษี' })
    .fill('0105567000001')
  await expect(submit).toBeDisabled()
  await businessFields.getByRole('textbox', { name: 'ชื่อร้านหรือบริษัท' }).fill('กาแฟริมคลอง')
  await expect(submit).toBeEnabled()
  await submit.click()

  await page.waitForURL(/\/orders\/.+/)
  await expect(page.getByText('กาแฟริมคลอง')).toBeVisible()
})
