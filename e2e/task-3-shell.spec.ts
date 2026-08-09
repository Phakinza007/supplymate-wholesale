import { expect, test } from '@playwright/test'

test('disables wholesale hover and focus transforms under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/')
  await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.innerHTML = `
      <article class="wholesale-product-card" data-testid="reduced-product">
        <a href="#fixture"><img alt="" src="/images/supplymate/cups-lids.png"></a>
      </article>
      <a href="#fixture" class="wholesale-category-tile" data-testid="reduced-category">
        <img alt="" src="/images/supplymate/cups-lids.png">
      </a>
    `
    document.body.append(fixture)
  })

  const product = page.getByTestId('reduced-product')
  const productImage = product.locator('img')
  await product.hover()
  await product.locator('a').focus()
  await expect(product).toHaveCSS('transform', 'none')
  await expect(productImage).toHaveCSS('transform', 'none')

  const category = page.getByTestId('reduced-category')
  const categoryImage = category.locator('img')
  await category.hover()
  await category.focus()
  await expect(category).toHaveCSS('transform', 'none')
  await expect(categoryImage).toHaveCSS('transform', 'none')
})

test('routes the demo-order link home and keeps notice ids unique', async ({ page }) => {
  await page.goto('/#/products/clear-cup-16oz')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByRole('link', { name: /ตะกร้า/ }).click()

  await expect(page.locator('#showcase-demo-notice')).toHaveCount(1)
  await expect(page.getByRole('note')).toHaveCount(2)

  await page.getByRole('link', { name: 'วิธีสั่งซื้อ (เดโม)' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('#showcase-demo-notice')).toBeVisible()
})
