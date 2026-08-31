import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { logIn } from './helpers/auth'

test('CSV import inserts new products as drafts and updates existing ones without republishing', async ({
  page,
}, testInfo) => {
  const suffix = `${Date.now()}`
  const slugA = `import-a-${suffix}`
  const slugB = `import-b-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })

  // First import: two new products, plus one deliberately invalid row.
  // sort_order/stock_quantity are set high and non-zero on purpose: a probe
  // product left at sort_order 0 with no stock would sit at the top of /shop
  // as "Out of stock" and break every later spec that buys the first product.
  const firstCsv = [
    'name,slug,price,min_order_quantity,sort_order,stock_quantity,supplier_note',
    `Import A ${suffix},${slugA},1000,2,9000,500,ignored column`,
    `Import B ${suffix},${slugB},2000,1,9000,500,ignored column`,
    `Broken ${suffix},BAD SLUG,not-a-price,1,9000,500,ignored column`,
  ].join('\n')
  const firstPath = testInfo.outputPath('first.csv')
  await writeFile(firstPath, firstCsv, 'utf8')

  await page.goto('/admin/products/import')
  await page.locator('#csv').setInputFiles(firstPath)

  await expect(page.getByText('ข้ามไป 1 แถวเพราะข้อมูลไม่ถูกต้อง')).toBeVisible()
  await expect(page.getByText(/บรรทัด 4:/)).toBeVisible()
  await expect(page.getByText('พร้อมนำเข้า 2 รายการ')).toBeVisible()

  await page.getByRole('button', { name: 'ยืนยันนำเข้า 2 รายการ' }).click()
  await expect(page.getByText('เพิ่มใหม่ 2 รายการ · อัปเดต 0 รายการ')).toBeVisible()

  // New rows land as drafts, so neither is on the storefront yet.
  await page.goto(`/products/${slugA}`)
  await expect(page.getByText('ไม่พบสินค้านี้')).toBeVisible()

  // Publish A by hand.
  await page.goto('/admin/products')
  await page
    .getByRole('row')
    .filter({ hasText: `Import A ${suffix}` })
    .getByRole('button', { name: 'แก้ไข' })
    .click()
  await page.locator('#status').selectOption('active')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.goto(`/products/${slugA}`)
  await expect(page.getByRole('heading', { name: `Import A ${suffix}` })).toBeVisible()

  // Second import: a price refresh with no status column. It must NOT
  // unpublish A -- that is the whole point of the insert/update split.
  const secondCsv = [
    'name,slug,price',
    `Import A ${suffix},${slugA},1500`,
    `Import B ${suffix},${slugB},2500`,
  ].join('\n')
  const secondPath = testInfo.outputPath('second.csv')
  await writeFile(secondPath, secondCsv, 'utf8')

  await page.goto('/admin/products/import')
  await page.locator('#csv').setInputFiles(secondPath)
  await expect(page.getByText('พร้อมนำเข้า 2 รายการ')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันนำเข้า 2 รายการ' }).click()
  await expect(page.getByText('เพิ่มใหม่ 0 รายการ · อัปเดต 2 รายการ')).toBeVisible()

  await page.goto(`/products/${slugA}`)
  await expect(page.getByRole('heading', { name: `Import A ${suffix}` })).toBeVisible()
  // Still published: the refresh carried no status column.
  await expect(page.getByText('฿1,500.00 / 1 ลัง')).toBeVisible()
  // And min_order_quantity survived, even though the refresh omitted it — a
  // full-payload update would have reset it to the parser default of 1.
  await expect(page.getByText('สั่งขั้นต่ำ 2 ลัง ต่อรายการ')).toBeVisible()

  // B was never published, so the refresh must not have published it either.
  await page.goto(`/products/${slugB}`)
  await expect(page.getByText('ไม่พบสินค้านี้')).toBeVisible()
})
