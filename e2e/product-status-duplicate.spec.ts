import { test, expect } from '@playwright/test'
import { logIn } from './helpers/auth'

test('draft products stay off the storefront, and duplicates land as drafts', async ({ page }) => {
  const suffix = `${Date.now()}`
  const name = `Status Probe ${suffix}`
  const slug = `status-probe-${suffix}`

  await logIn(page, { email: 'admin@example.com', password: 'password123' })

  // Create it as a draft.
  await page.goto('/admin/products')
  await page.getByRole('button', { name: 'New product' }).click()
  await page.locator('#name').fill(name)
  await page.locator('#slug').fill(slug)
  await page.locator('#price').fill('1290')
  await page.locator('#status').selectOption('draft')
  await page.getByRole('button', { name: 'Save product' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()

  // A draft is invisible to customers.
  await page.goto(`/products/${slug}`)
  await expect(page.getByText('Product not found.')).toBeVisible()

  // Publishing it makes it visible.
  await page.goto('/admin/products')
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Edit' }).click()
  await page.locator('#status').selectOption('active')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.goto(`/products/${slug}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Duplicating it produces a draft copy that is still invisible.
  await page.goto('/admin/products')
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'ทำซ้ำ' }).click()
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible()
  await expect(page.locator('#name')).toHaveValue(`${name} (สำเนา)`)
  await expect(page.locator('#slug')).toHaveValue(`${slug}-copy`)
  await expect(page.locator('#sku')).toHaveValue('')
  await expect(page.locator('#status')).toHaveValue('draft')

  await page.goto(`/products/${slug}-copy`)
  await expect(page.getByText('Product not found.')).toBeVisible()

  // Archiving drops the original out of the default admin view. Two rows now
  // carry `name` (the original and its copy), so each lookup is narrowed by
  // the status label as well. Chained `filter` calls are used rather than one
  // combined string because the name and the status badge are separate
  // elements, and JSX strips the whitespace between them.
  await page.goto('/admin/products')
  const originalRow = page
    .getByRole('listitem')
    .filter({ hasText: name })
    .filter({ hasText: 'เปิดขาย' })
  await originalRow.getByRole('button', { name: 'Edit' }).click()
  await page.locator('#status').selectOption('archived')
  await page.getByRole('button', { name: 'Save product' }).click()

  const archivedRow = page
    .getByRole('listitem')
    .filter({ hasText: name })
    .filter({ hasText: 'เลิกขาย' })
  await expect(archivedRow).toHaveCount(0)
  await page.getByRole('button', { name: 'เลิกขาย', exact: true }).click()
  await expect(archivedRow).toHaveCount(1)
})
