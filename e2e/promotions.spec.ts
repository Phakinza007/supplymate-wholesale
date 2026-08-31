import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'

test.skip(!brandConfig.features.promotions, 'promotions feature flag is off')

async function addFirstProductToCartAndReachCheckout(page: import('@playwright/test').Page) {
  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.goto('/cart')
  await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click()
  await fillBusinessDetails(page)
}

test('promotions module: admin creates a code, customer applies it, discount flows through to order detail', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/promotions')
  await adminPage.getByRole('button', { name: 'New promotion' }).click()
  await adminPage.locator('#promo-code').fill('TESTSAVE10')
  await adminPage.locator('#promo-value').fill('10')
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()
  await expect(adminPage.getByText('TESTSAVE10')).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Promo Customer',
    email: uniqueEmail('promo-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Promo Customer',
    phone: '0891234567',
    line1: '1 Promo Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(customerPage)

  await customerPage.getByPlaceholder('Promo code').fill('testsave10')
  await customerPage.getByRole('button', { name: 'Apply' }).click()
  await expect(customerPage.getByText('Code TESTSAVE10 applied')).toBeVisible()
  await expect(customerPage.getByText('ส่วนลด')).toBeVisible()

  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)
  await expect(customerPage.getByText('ส่วนลด (TESTSAVE10)')).toBeVisible()

  await adminContext.close()
  await customerContext.close()
})

test('promotions module: an invalid code is rejected with a clear message', async ({ page }) => {
  await signUp(page, {
    fullName: 'Invalid Promo Customer',
    email: uniqueEmail('invalid-promo'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'Invalid Promo Customer',
    phone: '0891234567',
    line1: '1 Invalid Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(page)

  await page.getByPlaceholder('Promo code').fill('NOSUCHCODE')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('code not found')).toBeVisible()
})

test('promotions module: a code deactivated after validation fails checkout instead of silently succeeding', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/promotions')
  await adminPage.getByRole('button', { name: 'New promotion' }).click()
  await adminPage.locator('#promo-code').fill('RACETEST')
  await adminPage.locator('#promo-value').fill('20')
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Race Customer',
    email: uniqueEmail('race-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Race Customer',
    phone: '0891234567',
    line1: '1 Race Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(customerPage)
  await customerPage.getByPlaceholder('Promo code').fill('RACETEST')
  await customerPage.getByRole('button', { name: 'Apply' }).click()
  await expect(customerPage.getByText('Code RACETEST applied')).toBeVisible()

  // Admin deactivates the code after the customer already validated it --
  // mirrors the exact deactivation-race class the Variants module's final
  // review found and fixed for variant selection.
  await adminPage.locator('li', { hasText: 'RACETEST' }).getByRole('button', { name: 'Edit' }).click()
  await adminPage.getByLabel('Active').uncheck()
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()

  await customerPage.getByRole('button', { name: 'สั่งซื้อ' }).click()
  await expect(
    customerPage.getByText('promo code is invalid or no longer available'),
  ).toBeVisible()
  await expect(customerPage).toHaveURL('/checkout')

  await adminContext.close()
  await customerContext.close()
})
