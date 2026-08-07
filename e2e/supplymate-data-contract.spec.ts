import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'

test('records an immutable wholesale business snapshot through the secure order RPC', async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!
  const buyer = createClient<Database>(supabaseUrl, anonKey)
  const email = `wholesale-contract-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`

  const { data: signUpData, error: signUpError } = await buyer.auth.signUp({
    email,
    password: 'password123',
    options: { data: { full_name: 'Wholesale Contract Buyer' } },
  })
  expect(signUpError).toBeNull()
  expect(signUpData.user).not.toBeNull()

  const { data: address, error: addressError } = await buyer
    .from('addresses')
    .insert({
      user_id: signUpData.user!.id,
      recipient_name: 'Wholesale Contract Buyer',
      phone: '0891234567',
      line1: '99 Test Street',
      province: 'Bangkok',
      postal_code: '10110',
      is_default: true,
    })
    .select('id')
    .single()
  expect(addressError).toBeNull()

  const { data: product, error: productError } = await buyer
    .from('products')
    .select('id, package_unit, units_per_package, min_order_quantity')
    .eq('slug', 'clear-cup-16oz')
    .single()
  expect(productError).toBeNull()
  expect(product).toMatchObject({
    package_unit: 'carton',
    units_per_package: 1000,
    min_order_quantity: 1,
  })

  const { data: order, error: orderError } = await buyer.rpc('create_order', {
    p_items: [
      {
        product_id: product!.id,
        variant_id: null,
        quantity: product!.min_order_quantity,
      },
    ],
    p_address_id: address!.id,
    p_business_details: {
      business_name: '  กาแฟริมคลอง  ',
      tax_id: ' 0105567000001 ',
      branch_name: '  สำนักงานใหญ่ ',
    },
  })
  expect(orderError).toBeNull()

  const admin = createClient<Database>(supabaseUrl, anonKey)
  const { error: adminSignInError } = await admin.auth.signInWithPassword({
    email: 'admin@example.com',
    password: 'password123',
  })
  expect(adminSignInError).toBeNull()

  const { error: rewriteError } = await admin
    .from('orders')
    .update({
      business_name: 'ค่าที่ผู้ดูแลพยายามแก้',
      tax_id: '9999999999999',
      branch_name: 'สาขาที่ถูกแก้',
    })
    .eq('id', order!.id)
  expect(rewriteError).toBeNull()

  const { data: snapshot, error: snapshotError } = await buyer
    .from('orders')
    .select('business_name, tax_id, branch_name')
    .eq('id', order!.id)
    .single()
  expect(snapshotError).toBeNull()
  expect(snapshot).toEqual({
    business_name: 'กาแฟริมคลอง',
    tax_id: '0105567000001',
    branch_name: 'สำนักงานใหญ่',
  })
})
