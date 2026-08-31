import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'

test.skip(!brandConfig.features.variants, 'variants feature flag is off')

test('variants module: admin creates variants, customer must select one, cart/checkout/order show variant name', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/products')
  await adminPage.getByRole('button', { name: 'แก้ไข' }).first().click()
  const productSlug = await adminPage.locator('#slug').inputValue()

  await adminPage.getByRole('button', { name: 'Add variant' }).click()
  await adminPage.locator('#variant-name').fill('Small')
  await adminPage.locator('#variant-stock').fill('5')
  await adminPage.getByRole('button', { name: 'Save variant' }).click()
  await expect(adminPage.getByText('Small', { exact: true })).toBeVisible()

  await adminPage.getByRole('button', { name: 'Add variant' }).click()
  await adminPage.locator('#variant-name').fill('Large (out of stock)')
  await adminPage.locator('#variant-stock').fill('0')
  await adminPage.getByRole('button', { name: 'Save variant' }).click()
  await expect(adminPage.getByText('Large (out of stock)', { exact: true })).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Variant Customer',
    email: uniqueEmail('variant-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Variant Customer',
    phone: '0891234567',
    line1: '1 Variant Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await customerPage.goto(`/products/${productSlug}`)
  await expect(customerPage.getByRole('button', { name: 'เลือกตัวเลือกก่อน' })).toBeDisabled()
  await expect(
    customerPage.getByRole('button', { name: 'Large (out of stock)' }),
  ).toBeDisabled()

  await customerPage.getByRole('button', { name: 'Small', exact: true }).click()
  await customerPage.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await expect(customerPage.getByText('เพิ่มแล้ว')).toBeVisible()

  await customerPage.goto('/cart')
  await expect(customerPage.getByText('Small')).toBeVisible()

  await customerPage.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await expect(customerPage.getByText(/\(Small\)/)).toBeVisible()
  await fillBusinessDetails(customerPage)
  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)
  await expect(customerPage.getByText(/\(Small\)/)).toBeVisible()

  await adminContext.close()
  await customerContext.close()
})

test('variants module: deactivating a variant after it is in the customer cart fails checkout instead of silently pricing at base', async ({
  browser,
}) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/products')
  await adminPage.getByRole('button', { name: 'แก้ไข' }).first().click()
  const productSlug = await adminPage.locator('#slug').inputValue()

  // Reuses the "Small" variant created by the previous test in this file
  // (same first admin product, DB not reset between tests in a run).
  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Stale Variant Customer',
    email: uniqueEmail('stale-variant-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Stale Variant Customer',
    phone: '0891234567',
    line1: '1 Stale Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await customerPage.goto(`/products/${productSlug}`)
  await customerPage.getByRole('button', { name: 'Small', exact: true }).click()
  await customerPage.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await expect(customerPage.getByText('เพิ่มแล้ว')).toBeVisible()

  // Admin deactivates the "Small" variant that's now sitting in the
  // customer's (localStorage-persisted) cart.
  await adminPage
    .locator('li', { hasText: 'Small' })
    // VariantsPanel's own row button is still "Edit" — only the admin product
    // list was renamed to แก้ไข.
    .getByRole('button', { name: 'Edit' })
    .click()
  await adminPage.locator('#variant-name').waitFor()
  await adminPage.getByLabel('Active', { exact: true }).uncheck()
  await adminPage.getByRole('button', { name: 'Save variant' }).click()
  await expect(adminPage.locator('li', { hasText: 'Small' })).toContainText('(inactive)')

  await customerPage.goto('/cart')
  await customerPage.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(customerPage)
  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await expect(customerPage.getByText(/one or more items are unavailable/i)).toBeVisible()
  // Checkout must not have silently succeeded at the base price.
  expect(customerPage.url()).toContain('/checkout')

  await adminContext.close()
  await customerContext.close()
})
