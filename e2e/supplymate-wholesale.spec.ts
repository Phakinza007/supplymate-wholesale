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

  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await expect(page.getByText('เพิ่มแล้ว')).toBeVisible()
  await page.goto('/cart')
  // Anchored: the quantity line starts with the unit count and may continue
  // "· N ชิ้น" once the product loads, while the price line ends with "/ 1 ลัง".
  // Only the quantity line starts with it.
  await expect(page.getByText(/^1 ลัง/)).toBeVisible()
})

test('enforces a larger MOQ again in the cart', async ({ page }) => {
  await page.goto('/products/thermal-label-50x30')

  const detailQuantity = page.getByRole('spinbutton', { name: 'จำนวนที่สั่งซื้อ' })
  await expect(detailQuantity).toHaveValue('6')
  await detailQuantity.fill('1')
  await expect(detailQuantity).toHaveValue('6')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()

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
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()

  await page.route(/\/rest\/v1\/products\?/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/cart')

  // Anchored: the quantity line starts with the unit count and may continue
  // "· N ชิ้น" once the product loads, while the price line ends with "/ 1 ลัง".
  // Only the quantity line starts with it.
  await expect(page.getByText(/^1 ลัง/)).toBeVisible()
  await expect(page.getByText('สินค้านี้ไม่พร้อมจำหน่ายแล้ว')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ไปหน้าชำระเงิน' })).toBeDisabled()
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
  await expect(page.getByRole('button', { name: 'สินค้าหมด' })).toBeDisabled()
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
  // The search input owns a suggestion listbox, so its role is combobox,
  // not the implicit searchbox.
  await expect(page.getByRole('combobox', { name: 'ค้นหาสินค้า' })).toBeVisible()
})

test('records business checkout details in the buyer order snapshot', async ({ page }) => {
  await page.goto('/products/clear-cup-16oz')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await expect(page.getByText('เพิ่มแล้ว')).toBeVisible()

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

  const submit = page.getByRole('button', { name: 'สั่งซื้อ' })
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

test('the catalogue can be read as a comparison table, and the choice is shareable', async ({
  page,
}) => {
  await page.goto('/shop')
  await page.getByRole('button', { name: 'ตารางเทียบราคา' }).click()

  // The columns a wholesale buyer scans down: what a piece costs now, and what
  // it costs at the bottom of the ladder.
  const table = page.getByRole('table')
  // `exact` matters: "ต่อชิ้น" is a substring of "ถูกสุดต่อชิ้น", and both are
  // real headers side by side.
  await expect(table.getByRole('columnheader', { name: 'ต่อชิ้น', exact: true })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'ถูกสุดต่อชิ้น' })).toBeVisible()
  await expect(table.locator('a[href^="/products/"]').first()).toBeVisible()

  // In the URL like every other catalogue control, so the view survives a
  // reload and can be sent to a colleague.
  await expect(page).toHaveURL(/view=table/)
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()

  await page.getByRole('button', { name: 'การ์ด', exact: true }).click()
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page).not.toHaveURL(/view=table/)
})

test('the catalogue keeps a heading a screen reader can navigate by', async ({ page }) => {
  // The card titles are h3. Without a heading for the listing itself the
  // outline jumps h1 -> h3, and someone browsing by heading cannot tell where
  // the products begin.
  await page.goto('/shop')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'รายการสินค้า' })).toBeAttached()
})

test('the comparison table holds the catalogue in one scroll', async ({ page }) => {
  // A table split across pages reintroduces the re-reading it exists to
  // remove, so it paginates far larger than the grid does.
  await page.goto('/shop?view=table')
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const tableRows = await rows.count()

  await page.goto('/shop')
  const cards = await page.locator('a[href^="/products/"]').count()
  expect(tableRows).toBeGreaterThan(cards)
})
