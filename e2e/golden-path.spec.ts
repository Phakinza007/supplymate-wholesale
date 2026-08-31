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

  const { orderUrl, orderNumber } = await buyFirstProductAndUploadSlip(customerPage, SLIP_PATH)
  await expect(customerPage.getByText('รอตรวจสอบการชำระเงิน', { exact: true })).toBeVisible()

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: orderNumber }).click()
  await adminPage.waitForURL(/\/admin\/orders\/.+/)
  await expect(adminPage.getByRole('heading', { name: 'ข้อมูลธุรกิจผู้สั่งซื้อ' })).toBeVisible()
  await expect(adminPage.getByText('Golden Path Business', { exact: true })).toBeVisible()

  await adminPage.getByRole('button', { name: 'ยืนยันการชำระเงิน' }).click()
  await expect(adminPage.getByText('ตรวจสอบการชำระเงินแล้ว', { exact: true })).toBeVisible()

  await adminPage.locator('#tracking').fill('TH1234567890')
  await adminPage.locator('#carrier').fill('Thailand Post')
  await adminPage.getByRole('button', { name: 'บันทึกการจัดส่ง' }).click()
  await expect(adminPage.getByText('จัดส่งแล้ว', { exact: true })).toBeVisible()

  await customerPage.goto(orderUrl)
  await expect(customerPage.getByText('จัดส่งแล้ว', { exact: true })).toBeVisible()
  await expect(customerPage.getByText('Thailand Post · TH1234567890')).toBeVisible()

  await adminPage.getByRole('button', { name: 'ปิดคำสั่งซื้อ' }).click()
  await expect(adminPage.getByText('คำสั่งซื้อเสร็จสมบูรณ์', { exact: true })).toBeVisible()

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

  const { orderUrl, orderNumber } = await buyFirstProductAndUploadSlip(
    customerPage,
    SLIP_PATH,
    'Rejected Slip Business',
  )

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: orderNumber }).click()
  await adminPage.getByRole('button', { name: 'ยืนยันการชำระเงิน' }).click()
  await expect(adminPage.getByText('ตรวจสอบการชำระเงินแล้ว', { exact: true })).toBeVisible()

  const rejectionReason = adminPage.getByRole('textbox', {
    name: 'เหตุผลที่ให้แนบสลิปใหม่',
  })
  const reject = adminPage.getByRole('button', { name: 'ปฏิเสธสลิป' })
  await expect(reject).toBeDisabled()
  await rejectionReason.fill('   ')
  await expect(reject).toBeDisabled()
  await rejectionReason.fill('ยอดโอนไม่ตรง')
  await expect(reject).toBeEnabled()
  await reject.click()
  await expect(adminPage.getByText('รอตรวจสอบการชำระเงิน', { exact: true })).toBeVisible()

  await customerPage.goto(orderUrl)
  await expect(customerPage.getByText('ยอดโอนไม่ตรง', { exact: true })).toBeVisible()
  await expect(customerPage.locator('input[type="file"]')).toBeVisible()
  await expect(customerPage.getByRole('button', { name: 'แนบสลิปการโอน' })).toBeVisible()

  await customerContext.close()
  await adminContext.close()
})
