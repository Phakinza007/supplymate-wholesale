import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress, buyFirstProductAndUploadSlip } from './helpers/checkout'

test.skip(!brandConfig.features.reviews, 'reviews feature flag is off')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SLIP_PATH = path.join(__dirname, 'fixtures', 'payment-slip.pdf')

test('reviews module: eligible customer can review, ineligible cannot, admin can hide', async ({ browser }) => {
  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()

  await signUp(customerPage, {
    fullName: 'Review Customer',
    email: uniqueEmail('review-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Review Customer',
    phone: '0891234567',
    line1: '1 Review Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  const { orderUrl } = await buyFirstProductAndUploadSlip(customerPage, SLIP_PATH)

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: /Order #/ }).first().click()
  await adminPage.getByRole('button', { name: 'ยืนยันการชำระเงิน' }).click()
  await adminPage.getByRole('button', { name: 'บันทึกการจัดส่ง' }).click()
  await adminPage.getByRole('button', { name: 'ปิดคำสั่งซื้อ' }).click()
  await expect(adminPage.getByText('คำสั่งซื้อเสร็จสมบูรณ์', { exact: true })).toBeVisible()

  await customerPage.goto(orderUrl)
  const reviewLink = customerPage.getByRole('link', { name: 'Write a review' })
  await expect(reviewLink).toBeVisible()
  const reviewHref = await reviewLink.getAttribute('href')
  await customerPage.goto(reviewHref!)

  await customerPage.getByRole('button', { name: 'Rate 5 stars' }).click()
  await customerPage.getByPlaceholder('Optional comment').fill('Excellent product')
  await customerPage.getByRole('button', { name: 'Submit review' }).click()
  await expect(customerPage.getByText('Excellent product')).toBeVisible()
  await expect(customerPage.getByText('5.0 ★ (1 review)')).toBeVisible()

  const strangerContext = await browser.newContext()
  const strangerPage = await strangerContext.newPage()
  await signUp(strangerPage, {
    fullName: 'Stranger',
    email: uniqueEmail('stranger'),
    password: 'password123',
  })
  await strangerPage.goto(reviewHref!.split('?')[0])
  await expect(strangerPage.getByText('Excellent product')).toBeVisible()
  await expect(strangerPage.getByRole('button', { name: 'Submit review' })).toHaveCount(0)

  await adminPage.goto(reviewHref!.split('?')[0])
  await adminPage.getByRole('button', { name: 'Hide' }).click()
  await strangerPage.reload()
  await expect(strangerPage.getByText('Excellent product')).toHaveCount(0)

  await customerContext.close()
  await adminContext.close()
  await strangerContext.close()
})
