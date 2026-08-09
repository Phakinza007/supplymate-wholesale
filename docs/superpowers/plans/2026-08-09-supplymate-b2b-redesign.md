# SupplyMate B2B Wholesale Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the static SupplyMate showcase as a credible Thai B2B wholesale storefront while preserving local-only catalogue, MOQ cart, hash routes, and simulated checkout.

**Architecture:** Keep `ShowcaseApp` as the static entry point and the existing Zustand memory cart as the only state store. Extract display-only B2B primitives under `src/showcase/`, compose them in the route pages, and place cross-route visual rules in `src/showcase/showcase.css`; URL filters remain in `useSearchParams` and all public image paths continue through `toShowcaseAssetUrl`.

**Tech Stack:** React 19, TypeScript, React Router HashRouter, Zustand, Tailwind CSS v4, Vitest, Playwright, Vite/GitHub Pages.

## Global Constraints

- Do not add npm dependencies, Supabase, auth, payment, delivery, or persistent orders.
- Use only local assets in `public/images/supplymate/` through `toShowcaseAssetUrl`.
- Keep the exact disclosure `Concept demo — ไม่รับคำสั่งซื้อจริง` visible in the shared route content.
- Preserve product data, search/category URL parameters, MOQ clamping, memory-only cart, confirmation clearing, and GitHub Pages hash routes.
- Use warm B2B tokens: paper `#F5F1E8`, ink `#173B32`, product green `#26765A`, terracotta `#D96945`.
- Preserve keyboard focus states and make movement optional under `prefers-reduced-motion: reduce`.
- Keep mobile width at 375 × 812 free of horizontal overflow.

---

### Task 1: Add the wholesale per-item pricing primitive

**Files:**
- Modify: `src/lib/wholesale.ts`
- Modify: `src/lib/wholesale.test.ts`

**Interfaces:**
- Produces: `perItemPrice(price: number, unitsPerPackage: number): number`
- Consumes: `formatPrice` only in display components; this helper returns a number so it remains presentation-independent.

- [ ] **Step 1: Write the failing unit tests**

Add these cases to `src/lib/wholesale.test.ts`:

```ts
import { formatPackageLabel, perItemPrice, quantityLabel } from './wholesale'

it('derives the wholesale price per individual item', () => {
  expect(perItemPrice(1_290, 1_000)).toBe(1.29)
  expect(perItemPrice(890, 300)).toBeCloseTo(2.9666666667)
})

it('does not divide by an invalid package size', () => {
  expect(perItemPrice(890, 0)).toBe(0)
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/lib/wholesale.test.ts`

Expected: FAIL because `perItemPrice` is not exported.

- [ ] **Step 3: Add the smallest helper**

Add to `src/lib/wholesale.ts`:

```ts
export function perItemPrice(price: number, unitsPerPackage: number) {
  if (!Number.isFinite(price) || !Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) {
    return 0
  }

  return price / unitsPerPackage
}
```

- [ ] **Step 4: Run the focused and full unit suites**

Run:

```bash
npx vitest run src/lib/wholesale.test.ts
npm run test:unit
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the isolated data primitive**

```bash
git add src/lib/wholesale.ts src/lib/wholesale.test.ts
git commit -m "feat: add wholesale per-item pricing"
```

### Task 2: Build reusable SupplyMate presentation primitives

**Files:**
- Create: `src/showcase/ShowcaseHero.tsx`
- Create: `src/showcase/ShowcaseCategoryTile.tsx`
- Create: `src/showcase/ShowcaseProductCard.tsx`
- Create: `src/showcase/WholesaleFacts.tsx`
- Create: `src/showcase/WholesaleOrderSummary.tsx`
- Create: `src/showcase/ShowcaseFooter.tsx`
- Modify: `src/showcase/ShowcaseNotice.tsx`

**Interfaces:**
- `ShowcaseHero` produces the home-only B2B hero and accepts no route state.
- `ShowcaseCategoryTile` consumes `{ name: string; slug: string; imagePath: string; productCount: number }`.
- `ShowcaseProductCard` consumes `{ product: DemoProduct; eager?: boolean }`.
- `WholesaleFacts` consumes `{ price: number; packageUnit: PackageUnit; unitsPerPackage: number; minOrderQuantity: number }`.
- `WholesaleOrderSummary` consumes `{ items: CartItem[]; subtotal: number; renderItemControl?: (item: CartItem) => ReactNode }`, renders order lines without store mutation, and exposes an optional action slot for the editable cart only.
- `ShowcaseFooter` is display-only and contains category links plus the static-demo statement.

- [ ] **Step 1: Create the visual primitives with semantic HTML**

Use the following data flow in `ShowcaseProductCard.tsx`; every public image URL must use the existing asset helper:

```tsx
export function ShowcaseProductCard({ product, eager = false }: ShowcaseProductCardProps) {
  return (
    <article className="wholesale-product-card">
      <Link to={`/products/${product.slug}`} className="wholesale-product-card__image-link">
        <img
          src={toShowcaseAssetUrl(product.imagePath)}
          alt={product.name}
          loading={eager ? 'eager' : 'lazy'}
        />
      </Link>
      <div className="wholesale-product-card__body">
        <p className="wholesale-product-card__eyebrow">{formatPackageLabel(product.packageUnit, product.unitsPerPackage)}</p>
        <h3><Link to={`/products/${product.slug}`}>{product.name}</Link></h3>
        <p className="wholesale-product-card__price">{formatPrice(product.price)} / {quantityLabel(product.packageUnit, 1)}</p>
        <p className="wholesale-product-card__unit">เฉลี่ย {formatPrice(perItemPrice(product.price, product.unitsPerPackage))} / ชิ้น</p>
        <p className="wholesale-product-card__moq">ขั้นต่ำ {quantityLabel(product.packageUnit, product.minOrderQuantity)}</p>
      </div>
    </article>
  )
}
```

`ShowcaseNotice` must retain the exact disclosure text, use the stable `id="showcase-demo-notice"`, and add a short supplementary local-data-only sentence. `WholesaleOrderSummary` must import `ReactNode` as a type, render a `<ul>` of item lines and a labelled subtotal. It may render the optional control slot supplied by the cart page, but must never read or mutate the store itself.

- [ ] **Step 2: Add a B2B hero and visual category tile**

`ShowcaseHero` must use only local assets, with a primary `Link` to `/shop`. `ShowcaseCategoryTile` must be a `Link` to `/shop?category=${encodeURIComponent(slug)}` and include an image, visible category name, and visible product count.

- [ ] **Step 3: Run type checking before composition**

Run: `npm run typecheck`

Expected: PASS. Resolve all import/type errors before touching route pages.

- [ ] **Step 4: Commit reusable primitives**

```bash
git add src/showcase
git commit -m "feat: add B2B showcase presentation primitives"
```

### Task 3: Apply the B2B visual system and shared shell

**Files:**
- Modify: `src/index.css`
- Create: `src/showcase/showcase.css`
- Modify: `src/main.tsx`
- Modify: `src/showcase/ShowcaseApp.tsx`

**Interfaces:**
- `src/main.tsx` imports `@/showcase/showcase.css` after `./index.css`.
- `ShowcaseApp` renders `ShowcaseFooter` below `main`; no route is allowed to render a second footer.
- The header continues to derive cart count from `useCartTotalItems()`.

- [ ] **Step 1: Add colour tokens and import the showcase stylesheet**

Replace the current neutral colour tokens in `src/index.css` with the approved values and their accessible foreground variants. Import the dedicated CSS in `src/main.tsx`:

```ts
import './index.css'
import '@/showcase/showcase.css'
```

- [ ] **Step 2: Create named visual primitives in `showcase.css`**

Implement these selectors as the only custom visual surface layer:

```css
.showcase-utility { /* thin B2B context strip */ }
.showcase-header { /* sticky paper header and navigation */ }
.showcase-hero { /* two-column editorial home hero */ }
.showcase-hero__collage { /* local product-image collage */ }
.wholesale-category-tile { /* image-led category card */ }
.wholesale-product-card { /* product card with focus/hover states */ }
.wholesale-facts { /* unit, pack, MOQ, per-item facts */ }
.wholesale-summary { /* reusable cart/checkout total surface */ }
.showcase-demo-notice { /* visible concept disclosure */ }
.showcase-footer { /* shared closing surface */ }
```

Use a maximum content width of `72rem`, responsive grid collapse at `48rem`, `:focus-visible` outlines in product green, and this exact reduced-motion guard:

```css
@media (prefers-reduced-motion: reduce) {
  .wholesale-product-card,
  .wholesale-product-card img,
  .wholesale-category-tile,
  .wholesale-category-tile img {
    transition: none;
    transform: none;
  }
}
```

- [ ] **Step 3: Compose the shared header/footer without changing routing**

Move the current inline `ShowcaseHeader` implementation into the new B2B shell structure in `ShowcaseApp.tsx`. It must include the utility strip, brand, catalogue link, an anchor link to `#showcase-demo-notice` labelled `วิธีสั่งซื้อ (เดโม)`, and the existing accessible cart count. Keep `HashRouter`, existing five route paths, and the fallback `Navigate` unchanged. Render `<ShowcaseFooter />` after `</main>`.

- [ ] **Step 4: Validate the build and static boundary**

Run:

```bash
npm run typecheck
npm run lint
npm run build:pages
npm run test:showcase-artifact
```

Expected: all commands PASS and the generated bundle contains neither Supabase URL nor Supabase host.

- [ ] **Step 5: Commit the shared visual system**

```bash
git add src/index.css src/main.tsx src/showcase/showcase.css src/showcase/ShowcaseApp.tsx
git commit -m "feat: add SupplyMate B2B visual system"
```

### Task 4: Redesign the home and catalogue while retaining URL filters

**Files:**
- Modify: `src/showcase/ShowcaseCataloguePage.tsx`
- Create: `e2e/static-showcase.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Home mode renders `ShowcaseHero`, six `ShowcaseCategoryTile`s, and three `ShowcaseProductCard`s.
- Shop mode renders a labelled toolbar, result count, active category state, `ShowcaseProductCard`s, and a conditional clear-filter button.
- `npm run test:showcase-e2e` runs only `e2e/static-showcase.spec.ts` and does not invoke Supabase setup.

- [ ] **Step 1: Write the failing static showcase browser test**

Create `e2e/static-showcase.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('keeps the B2B catalogue journey usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const consoleErrors: string[] = []
  const resourceErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('response', response => {
    if (new URL(response.url()).origin === 'http://localhost:5174' && response.status() >= 400) {
      resourceErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/#/')
  await expect(page.getByText('Concept demo — ไม่รับคำสั่งซื้อจริง')).toBeVisible()
  await page.getByRole('link', { name: 'เลือกดูแคตตาล็อก' }).click()
  await expect(page).toHaveURL(/#\/shop/)
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).fill('แก้ว')
  await expect(page.getByRole('heading', { name: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม' })).toBeVisible()

  const layout = await page.evaluate(() => ({
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  expect(layout.canScrollX).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(resourceErrors).toEqual([])
})
```

Add this script to `package.json`:

```json
"test:showcase-e2e": "playwright test e2e/static-showcase.spec.ts --project=chromium"
```

- [ ] **Step 2: Run the focused browser test to verify it fails**

Run: `npm run test:showcase-e2e`

Expected: FAIL because the new CTA name and B2B card structure do not exist yet.

- [ ] **Step 3: Compose home mode from the new primitives**

Map each category to its first matching local product image before rendering tiles:

```ts
const categoryTiles = demoCategories.map((category) => {
  const products = demoProducts.filter((product) => product.categorySlug === category.slug)
  return { ...category, imagePath: products[0].imagePath, productCount: products.length }
})
```

Use `<ShowcaseHero />`, category tiles, and the first three `ShowcaseProductCard`s. Give the hero CTA the visible label `เลือกดูแคตตาล็อก`.

- [ ] **Step 4: Redesign shop mode without changing the URL contract**

Keep `useSearchParams` and `updateFilter`. Add a result count that changes with `visibleProducts.length`, add a clear button when `query || categorySlug`, and make that button call:

```ts
setSearchParams({})
```

Render the cards through `<ShowcaseProductCard product={product} />`; do not duplicate product-card markup in the page.

- [ ] **Step 5: Run focused regression checks**

Run:

```bash
npm run test:unit
npm run test:showcase-e2e
npm run typecheck
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 6: Commit home, catalogue, and static browser coverage**

```bash
git add src/showcase/ShowcaseCataloguePage.tsx e2e/static-showcase.spec.ts package.json
git commit -m "feat: redesign SupplyMate catalogue journey"
```

### Task 5: Redesign product, cart, and simulated checkout surfaces

**Files:**
- Modify: `src/showcase/ShowcaseProductPage.tsx`
- Modify: `src/showcase/ShowcaseCartPage.tsx`
- Modify: `src/showcase/ShowcaseCheckoutPage.tsx`
- Modify: `e2e/static-showcase.spec.ts`

**Interfaces:**
- Product page passes product price, unit, pack size, and MOQ to `WholesaleFacts`.
- Checkout and confirmation pass their existing `{ items, subtotal }` to `WholesaleOrderSummary`; cart also supplies a `renderItemControl` callback containing its existing quantity and remove controls.
- Checkout confirmation uses the same summary with the in-state snapshot before the cart is cleared.

- [ ] **Step 1: Extend the focused static browser test with the order flow**

Append this test:

```ts
test('keeps MOQ, the cart summary, and simulated confirmation intact', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/#/products/blank-label-roll-50x30')
  const quantity = page.getByRole('spinbutton', { name: 'จำนวน' })
  await expect(quantity).toHaveValue('3')
  await quantity.fill('1')
  await expect(quantity).toHaveValue('3')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await page.getByRole('link', { name: /ตะกร้า/ }).click()
  await expect(page.getByText('ยอดรวมสินค้า')).toBeVisible()
  await page.getByRole('link', { name: 'ไปยังการสั่งซื้อจำลอง' }).click()
  await page.getByRole('button', { name: 'ยืนยันคำสั่งซื้อจำลอง' }).click()
  await expect(page.getByRole('heading', { name: 'บันทึกการสาธิตแล้ว' })).toBeVisible()
  await expect(page.getByText('ไม่มีการส่งหรือบันทึกคำสั่งซื้อ การชำระเงิน หรือข้อมูลลูกค้า')).toBeVisible()
})
```

- [ ] **Step 2: Run the test before changing page composition**

Run: `npm run test:showcase-e2e`

Expected: the new test passes before visual refactoring; it captures the behaviour that must not regress.

- [ ] **Step 3: Recompose product detail around wholesale facts**

Keep the current `useParams`, `findDemoProduct`, effect that resets quantity, `clampToMinimum`, and `addItem` call. Replace the duplicated pack/MOQ block with:

```tsx
<WholesaleFacts
  price={product.price}
  packageUnit={product.packageUnit}
  unitsPerPackage={product.unitsPerPackage}
  minOrderQuantity={product.minOrderQuantity}
/>
```

Place the image and facts in the B2B product layout, preserving the named quantity field, add-to-cart button, and status announcement.

- [ ] **Step 4: Recompose cart, checkout, and confirmation around the shared summary**

Keep all existing `updateQuantity`, `removeItem`, `clear`, `Navigate`, reference generation, and state snapshot logic. In the cart, move the current quantity input and remove button into the summary's explicit action slot; checkout and confirmation use the summary without a slot. The summary owns the repeated item-line and subtotal markup:

```tsx
<WholesaleOrderSummary
  items={items}
  subtotal={subtotal}
  renderItemControl={(item) => (
    <CartLineControls
      item={item}
      onQuantityChange={(quantity) => updateQuantity(item.productId, item.variantId, quantity)}
      onRemove={() => removeItem(item.productId, item.variantId)}
    />
  )}
/>
```

`CartLineControls` is a route-local helper in `ShowcaseCartPage.tsx`, receives the existing minimum quantity, and preserves the Thai `จำนวน` label and `ลบสินค้า` button. For the confirmation branch use `confirmation.items` and `confirmation.subtotal`; do not read cleared store items after confirmation.

- [ ] **Step 5: Run full behavioural and static verification**

Run:

```bash
npm run test:unit
npm run test:showcase-e2e
npm run typecheck
npm run lint
npm run build:pages
npm run test:showcase-artifact
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the remaining shopping surfaces**

```bash
git add src/showcase/ShowcaseProductPage.tsx src/showcase/ShowcaseCartPage.tsx src/showcase/ShowcaseCheckoutPage.tsx e2e/static-showcase.spec.ts
git commit -m "feat: restyle SupplyMate wholesale order flow"
```

### Task 6: Perform production-style visual and mobile release verification

**Files:**
- No production source changes expected unless verification finds a regression.

**Interfaces:**
- Uses built `dist/` output from `npm run build:pages`.
- Uses `e2e/static-showcase.spec.ts` for mobile interaction coverage.

- [ ] **Step 1: Start a static Pages-like preview**

Run:

```bash
npm run build:pages
npx vite preview --outDir dist --port 4173 --strictPort
```

Expected: preview serves the site under its generated GitHub Pages base path.

- [ ] **Step 2: Manually inspect every static route at mobile and desktop sizes**

Check `/#/`, `/#/shop`, `/#/products/clear-cup-16oz`, `/#/cart`, and `/#/checkout` at 375 × 812 and 1440 × 960. Confirm product image paths start with `/supplymate-wholesale/images/supplymate/` in the Pages build and no card, category tile, header, or order summary creates horizontal scrolling.

- [ ] **Step 3: Run the release suite from a clean working tree**

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:showcase-e2e
npm run build:pages
npm run test:showcase-artifact
git status --short
```

Expected: all checks PASS and `git status --short` reports no unexpected files. Do not commit generated `dist/` or `.superpowers/` brainstorming files.

- [ ] **Step 4: Commit only if verification required a source correction**

If no source changed, do not create an empty commit. Otherwise use:

```bash
git add <only-the-corrected-source-files>
git commit -m "fix: polish SupplyMate B2B responsive layout"
```

## Plan Self-Review

- Spec coverage: Tasks 1–5 implement every visual, shell, component, interaction, and constraint in the approved design. Task 6 verifies the deployment-specific asset and mobile requirements.
- Placeholder scan: no task contains an unassigned implementation step; all generated components, scripts, selectors, test names, commands, and copy are specified.
- Type consistency: `ShowcaseProductCard` consumes existing `DemoProduct`; summary components consume existing `CartItem`, with an explicitly typed optional render slot for cart controls; per-item calculation is a pure numeric helper; image resolution remains through the existing `toShowcaseAssetUrl` interface.
