import { test, expect } from '@playwright/test'
import { logIn } from './helpers/auth'

test('draft products stay off the storefront, and duplicates land as drafts', async ({ page }) => {
  const suffix = `${Date.now()}`
  const name = `Status Probe ${suffix}`
  const slug = `status-probe-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })

  // Create it as a draft.
  await page.goto('/admin/products')
  await page.getByRole('button', { name: '+ เพิ่มสินค้า' }).click()
  await page.locator('#name').fill(name)
  // Let the form's blur-driven auto-slug fire and settle BEFORE writing the
  // slug, then overwrite it. Filling #slug directly after #name races that
  // handler and lands a doubled slug.
  await page.locator('#name').blur()
  await page.locator('#slug').fill(slug)
  await expect(page.locator('#slug')).toHaveValue(slug)
  await page.locator('#price').fill('1290')
  await page.locator('#status').selectOption('draft')
  // Keep probe products at the end of /shop so they never become the
  // "first product" other specs buy.
  await page.locator('#sort_order').fill('9000')
  await page.getByRole('button', { name: 'Save product' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()

  // A draft is invisible to customers.
  await page.goto(`/products/${slug}`)
  await expect(page.getByText('ไม่พบสินค้านี้')).toBeVisible()

  // Publishing it makes it visible.
  await page.goto('/admin/products')
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'แก้ไข' }).click()
  await page.locator('#status').selectOption('active')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.goto(`/products/${slug}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Duplicating it produces a draft copy that is still invisible.
  await page.goto('/admin/products')
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()
  await expect(page.locator('#name')).toHaveValue(`${name} (สำเนา)`)
  await expect(page.locator('#slug')).toHaveValue(`${slug}-copy`)
  await expect(page.locator('#sku')).toHaveValue('')
  await expect(page.locator('#status')).toHaveValue('draft')

  await page.goto(`/products/${slug}-copy`)
  await expect(page.getByText('ไม่พบสินค้านี้')).toBeVisible()

  // Archiving drops the original out of the default admin view. Two rows now
  // carry `name` (the original and its copy), so each lookup is narrowed by
  // the status label as well. Chained `filter` calls are used rather than one
  // combined string because the name and the status badge are separate
  // elements, and JSX strips the whitespace between them.
  await page.goto('/admin/products')
  // Two rows now carry `name` (the original and its copy). The copy is a
  // draft, so the original is the one whose status group reports "แสดง"
  // selected — its own row is the only place that is true.
  const originalRow = page
    .getByRole('row')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('button', { name: 'แสดง', pressed: true }) })
  await originalRow.getByRole('button', { name: 'แก้ไข' }).click()
  await page.locator('#status').selectOption('archived')
  await page.getByRole('button', { name: 'Save product' }).click()

  const archivedRow = page
    .getByRole('row')
    .filter({ hasText: name })
    .filter({ has: page.getByRole('button', { name: 'เก็บ', pressed: true }) })
  await expect(archivedRow).toHaveCount(0)
  await page.getByRole('button', { name: /^เลิกขาย \d+$/ }).click()
  await expect(archivedRow).toHaveCount(1)
})
