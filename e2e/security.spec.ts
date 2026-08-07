import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { signUp, uniqueEmail } from './helpers/auth'
import { addAddress, buyFirstProductAndUploadSlip } from './helpers/checkout'
import type { Database } from '../src/lib/database.types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SLIP_PATH = path.join(__dirname, 'fixtures', 'payment-slip.pdf')

test('non-admin is denied /admin', async ({ page }) => {
  await signUp(page, {
    fullName: 'Plain Customer',
    email: uniqueEmail('plain-customer'),
    password: 'password123',
  })

  await page.goto('/admin')
  await page.waitForURL('/')
  await expect(page).toHaveURL('/')
})

test("a user cannot read another user's payment slip", async ({ page }) => {
  const emailA = uniqueEmail('customer-a')
  const emailB = uniqueEmail('customer-b')
  const password = 'password123'

  await signUp(page, { fullName: 'Customer A', email: emailA, password })
  await addAddress(page, {
    recipientName: 'Customer A',
    phone: '0891111111',
    line1: '1 Test Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  const { orderUrl } = await buyFirstProductAndUploadSlip(page, SLIP_PATH)
  const orderId = new URL(orderUrl).pathname.split('/').pop()!

  const supabaseUrl = process.env.VITE_SUPABASE_URL!
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!

  // Sign in as A directly (Node-side) to read back A's own slip path -- the exact value
  // attach_payment_slip() wrote, not a guess at the upload path's naming scheme.
  const clientA = createClient<Database>(supabaseUrl, anonKey)
  const { error: signInAError } = await clientA.auth.signInWithPassword({ email: emailA, password })
  expect(signInAError).toBeNull()

  const { data: orderRow, error: orderRowError } = await clientA
    .from('orders')
    .select('payment_slip_path')
    .eq('id', orderId)
    .single()
  expect(orderRowError).toBeNull()
  const slipStoragePath = orderRow!.payment_slip_path
  expect(slipStoragePath).toBeTruthy()

  // Positive control: A can read her own slip. Without this, a bucket rename or a dropped
  // storage policy that broke signed URLs for *everyone* would still leave this test green --
  // Customer B's error assertion alone can't distinguish "correctly denied" from "broken for all".
  const { data: ownSignedUrlData, error: ownSignedUrlError } = await clientA.storage
    .from('payment-slips')
    .createSignedUrl(slipStoragePath!, 60)
  expect(ownSignedUrlError).toBeNull()
  expect(ownSignedUrlData?.signedUrl).toBeTruthy()

  // Customer B: independent account, created directly via the API (no UI signup needed here --
  // the signup UI itself is already covered by the golden-path and "non-admin" specs).
  const clientB = createClient<Database>(supabaseUrl, anonKey)
  const { error: signUpBError } = await clientB.auth.signUp({
    email: emailB,
    password,
    options: { data: { full_name: 'Customer B' } },
  })
  expect(signUpBError).toBeNull()

  const { data: signedUrlData, error: signedUrlError } = await clientB.storage
    .from('payment-slips')
    .createSignedUrl(slipStoragePath!, 60)

  expect(signedUrlError).toBeTruthy()
  expect(signedUrlData).toBeNull()
})
