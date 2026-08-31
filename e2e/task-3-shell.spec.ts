import { expect, test } from '@playwright/test'

function relativeLuminance([red, green, blue]: number[]) {
  const channels = [red, green, blue].map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(first: number[], second: number[]) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

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
  await page.getByRole('banner').getByRole('link', { name: /ตะกร้า/ }).click()

  // One standing disclosure per page: the cart no longer repeats it, so the id
  // stays unique and `note` never doubles up.
  await expect(page.locator('#showcase-demo-notice')).toHaveCount(1)
  await expect(page.getByRole('note')).toHaveCount(1)

  await page.getByRole('link', { name: 'วิธีสั่งซื้อ (เดโม)' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('#showcase-demo-notice')).toBeVisible()
})

test('keeps footer keyboard focus visible against the dark surface', async ({ page }) => {
  await page.goto('/#/')
  const footerLink = page.locator('.showcase-footer a').first()
  await footerLink.focus()

  const colors = await footerLink.evaluate(link => {
    const footer = link.closest('.showcase-footer')
    if (!footer) throw new Error('Footer surface not found')

    // Paint the colour and read the pixel back. The palette is authored in
    // oklch(), which computed style serialises as `oklch(...)` -- a digit-scrape
    // would read 0.24 as an 8-bit channel and quietly report ~1:1 contrast.
    const toRgb = (value: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context unavailable')
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data
      return [red, green, blue]
    }

    return {
      outline: toRgb(getComputedStyle(link).outlineColor),
      surface: toRgb(getComputedStyle(footer).backgroundColor),
    }
  })

  expect(colors.outline).toHaveLength(3)
  expect(colors.surface).toHaveLength(3)
  expect(contrastRatio(colors.outline, colors.surface)).toBeGreaterThanOrEqual(3)
})
