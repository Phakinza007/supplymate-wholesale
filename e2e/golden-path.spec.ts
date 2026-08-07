import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress, buyFirstProductAndUploadSlip } from './helpers/checkout'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SLIP_PATH = path.join(__dirname, 'fixtures', 'payment-slip.pdf')

test('golden path: register, buy, pay, admin fulfills, customer sees tracking and done', async ({ browser }) => {
  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()

  await signUp(customerPage, {
    fullName: 'Golden Path Customer',
    email: uniqueEmail('golden-customer'),
    password: 'password123',
  })

  await addAddress(customerPage, {
    recipientName: 'Golden Path Customer',
    phone: '0891234567',
    line1: '99 Test Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  const { orderUrl, orderHeading } = await buyFirstProductAndUploadSlip(customerPage, SLIP_PATH)
  await expect(customerPage.getByText('รอตรวจสอบการชำระเงิน', { exact: true })).toBeVisible()

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: orderHeading }).click()
  await adminPage.waitForURL(/\/admin\/orders\/.+/)
  await expect(adminPage.getByRole('heading', { name: 'ข้อมูลธุรกิจผู้สั่งซื้อ' })).toBeVisible()
  await expect(adminPage.getByText('Golden Path Business', { exact: true })).toBeVisible()

  await adminPage.getByRole('button', { name: 'Verify payment' }).click()
  await expect(adminPage.getByText('Status: verified')).toBeVisible()

  await adminPage.locator('#tracking').fill('TH1234567890')
  await adminPage.locator('#carrier').fill('Thailand Post')
  await adminPage.getByRole('button', { name: 'Mark as shipped' }).click()
  await expect(adminPage.getByText('Status: shipped')).toBeVisible()

  await customerPage.goto(orderUrl)
  await expect(customerPage.getByText('จัดส่งแล้ว', { exact: true })).toBeVisible()
  await expect(customerPage.getByText('Thailand Post · TH1234567890')).toBeVisible()

  await adminPage.getByRole('button', { name: 'Mark as done' }).click()
  await expect(adminPage.getByText('Status: done')).toBeVisible()

  await customerPage.goto(orderUrl)
  await expect(customerPage.getByText('คำสั่งซื้อเสร็จสมบูรณ์', { exact: true })).toBeVisible()

  await customerContext.close()
  await adminContext.close()
})

test('admin must explain a rejected slip and buyer can safely re-upload', async ({ browser }) => {
  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()

  await signUp(customerPage, {
    fullName: 'Rejected Slip Customer',
    email: uniqueEmail('rejected-slip-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Rejected Slip Customer',
    phone: '0891234567',
    line1: '55 Test Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  const { orderUrl, orderHeading } = await buyFirstProductAndUploadSlip(
    customerPage,
    SLIP_PATH,
    'Rejected Slip Business',
  )

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: orderHeading }).click()
  await adminPage.getByRole('button', { name: 'Verify payment' }).click()
  await expect(adminPage.getByText('Status: verified')).toBeVisible()

  const rejectionReason = adminPage.getByRole('textbox', {
    name: 'เหตุผลที่ให้แนบสลิปใหม่',
  })
  const reject = adminPage.getByRole('button', { name: 'Reject slip (request re-upload)' })
  await expect(reject).toBeDisabled()
  await rejectionReason.fill('   ')
  await expect(reject).toBeDisabled()
  await rejectionReason.fill('ยอดโอนไม่ตรง')
  await expect(reject).toBeEnabled()
  await reject.click()
  await expect(adminPage.getByText('Status: pending')).toBeVisible()

  await customerPage.goto(orderUrl)
  await expect(customerPage.getByText('ยอดโอนไม่ตรง', { exact: true })).toBeVisible()
  await expect(customerPage.locator('input[type="file"]')).toBeVisible()
  await expect(customerPage.getByRole('button', { name: 'Upload payment slip' })).toBeVisible()

  await customerContext.close()
  await adminContext.close()
})
