import type { Page } from '@playwright/test'

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.com`
}

export async function signUp(
  page: Page,
  opts: { fullName: string; email: string; password: string },
): Promise<void> {
  await page.goto('/signup')
  await page.locator('#fullName').fill(opts.fullName)
  await page.locator('#email').fill(opts.email)
  await page.locator('#password').fill(opts.password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL('/')
}

export async function logIn(
  page: Page,
  opts: { email: string; password: string },
): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(opts.email)
  await page.locator('#password').fill(opts.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('/')
}
