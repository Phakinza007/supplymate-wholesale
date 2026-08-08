# SupplyMate Static Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a truthful, interactive Thai SupplyMate wholesale concept demo to GitHub Pages without Supabase, secrets, login, or customer-data persistence.

**Architecture:** A local catalogue module becomes the single source of truth for the showcase route tree. The entry point mounts only this tree, so its production artifact does not import Supabase or authentication code. A non-persistent Zustand cart supports a simulated buyer flow from product browsing through a clearly labelled confirmation.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4, React Router, Zustand, Vitest, Playwright, GitHub Pages.

## Global Constraints

- Every buyer-facing string is Thai and every conversion-adjacent surface says `Concept demo — ไม่รับคำสั่งซื้อจริง`.
- The deployed entry point must not import Supabase, AuthProvider, or an optional feature module.
- The only routes are `#/`, `#/shop`, `#/products/:slug`, `#/cart`, and `#/checkout`.
- All product images are existing generated local `/images/supplymate/*.png` assets.
- Cart state is memory-only; it must not use `localStorage`, network requests, login, payment collection, or admin data.
- Package units are limited to `carton`, `pack`, `roll`, and `case`; quantities always clamp to the product minimum.
- The Pages workflow remains manual and receives no Supabase credential environment variables.

---

### Task 1: Establish the static catalogue contract

**Files:**
- Create: `src/demo/catalogue.ts`
- Create: `src/demo/catalogue.test.ts`

**Interfaces:**
- Produces `DemoCategory`, `DemoProduct`, `demoCategories`, `demoProducts`, `findDemoProduct(slug)`, `filterDemoProducts(products, query, categorySlug)`, and `clampToMinimum(quantity, minimum)`.
- Consumes: `PackageUnit` from `src/lib/wholesale.ts` and the generated local SupplyMate image paths.

- [ ] **Step 1: Write the failing unit tests.**

```ts
import { describe, expect, it } from 'vitest'
import {
  clampToMinimum,
  demoProducts,
  filterDemoProducts,
  findDemoProduct,
} from './catalogue'

describe('SupplyMate static catalogue', () => {
  it('finds a product by its stable URL slug', () => {
    expect(findDemoProduct('clear-cup-16oz')?.name).toBe('แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม')
  })

  it('matches Thai search and category filters together', () => {
    const results = filterDemoProducts(demoProducts, 'แก้ว', 'cups-lids')
    expect(results.map((product) => product.slug)).toEqual(['clear-cup-16oz'])
  })

  it('clamps invalid and below-minimum quantities to the minimum', () => {
    expect(clampToMinimum(0, 3)).toBe(3)
    expect(clampToMinimum(2.5, 3)).toBe(3)
    expect(clampToMinimum(6, 3)).toBe(6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails because the module is absent.**

Run: `npx vitest run src/demo/catalogue.test.ts`

Expected: FAIL with a module-not-found error for `./catalogue`.

- [ ] **Step 3: Implement the local catalogue module.**

Create six categories (`cups-lids`, `food-containers`, `paper-bags`, `labels`, `bar-tools`, `eco-packaging`) and exactly one representative product per category. Use these exact records (the six `id` values are prefixed with `demo-`):

| `slug` | `categorySlug` | `name` | `price` | `imagePath` | `packageUnit` | `unitsPerPackage` | `minOrderQuantity` |
|---|---|---|---:|---|---|---:|---:|
| `clear-cup-16oz` | `cups-lids` | แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม | 1,290 | `/images/supplymate/cups-lids.png` | `carton` | 1,000 | 1 |
| `kraft-food-container-650ml` | `food-containers` | กล่องอาหารคราฟต์ 650 มล. พร้อมฝา | 890 | `/images/supplymate/food-containers.png` | `case` | 300 | 1 |
| `kraft-carry-bag-m` | `paper-bags` | ถุงกระดาษคราฟต์หูหิ้ว ขนาด M | 640 | `/images/supplymate/paper-bags.png` | `pack` | 100 | 2 |
| `blank-label-roll-50x30` | `labels` | สติ๊กเกอร์เปล่า 50 × 30 มม. | 520 | `/images/supplymate/labels.png` | `roll` | 500 | 3 |
| `stainless-bar-tool-set` | `bar-tools` | ชุดอุปกรณ์บาร์สเตนเลสพื้นฐาน | 1,450 | `/images/supplymate/bar-tools.png` | `case` | 12 | 1 |
| `bagasse-clamshell-9in` | `eco-packaging` | กล่องชานอ้อยฝาพับ 9 นิ้ว | 1,080 | `/images/supplymate/eco-packaging.png` | `case` | 200 | 1 |

Give each item a concise Thai description appropriate to its category. Include the first record verbatim:

```ts
{
  id: 'demo-clear-cup-16oz',
  slug: 'clear-cup-16oz',
  categorySlug: 'cups-lids',
  name: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม',
  description: 'แก้ว PET สำหรับเครื่องดื่มเย็น เหมาะกับคาเฟ่และร้านเครื่องดื่ม',
  price: 1_290,
  imagePath: '/images/supplymate/cups-lids.png',
  packageUnit: 'carton',
  unitsPerPackage: 1_000,
  minOrderQuantity: 1,
}
```

Implement filtering with trimmed, lower-cased substring matching against the name, description, and category name. `clampToMinimum` must return `minimum` for non-integers, non-positive values, and values below `minimum`; otherwise return the integer input.

- [ ] **Step 4: Run the focused test and the existing wholesale tests.**

Run: `npx vitest run src/demo/catalogue.test.ts src/lib/wholesale.test.ts`

Expected: all assertions pass.

- [ ] **Step 5: Commit the catalogue contract.**

```bash
git add src/demo/catalogue.ts src/demo/catalogue.test.ts
git commit -m "feat: add static SupplyMate catalogue"
```

### Task 2: Make cart state local and MOQ-safe

**Files:**
- Modify: `src/core/cart/cartStore.ts`
- Create: `src/core/cart/cartStore.test.ts`

**Interfaces:**
- Consumes: `clampToMinimum(quantity, minimum)` from `src/demo/catalogue.ts`.
- Produces the existing `useCartStore`, `useCartTotalItems`, and `useCartSubtotal` API without Zustand `persist` middleware.

- [ ] **Step 1: Write the failing cart-state tests.**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cartStore'

const line = {
  productId: 'demo-clear-cup-16oz',
  variantId: null,
  productName: 'แก้วพลาสติกใส 16 ออนซ์ พร้อมฝาโดม',
  productSlug: 'clear-cup-16oz',
  variantName: null,
  unitPrice: 1290,
  imagePath: '/images/supplymate/cups-lids.png',
  packageUnit: 'carton' as const,
  minOrderQuantity: 3,
}

describe('showcase cart', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('clamps a new line to its minimum order quantity', () => {
    useCartStore.getState().addItem(line, 1)
    expect(useCartStore.getState().items[0]?.quantity).toBe(3)
  })

  it('clamps an edited line to its minimum without deleting it', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().updateQuantity(line.productId, null, 0)
    expect(useCartStore.getState().items[0]?.quantity).toBe(3)
  })
})
```

- [ ] **Step 2: Run the test to observe the current below-minimum/delete behavior.**

Run: `npx vitest run src/core/cart/cartStore.test.ts`

Expected: FAIL because `updateQuantity(..., 0)` removes the line and `addItem(..., 1)` stores quantity `1`.

- [ ] **Step 3: Remove persistence and enforce MOQ at the store boundary.**

Remove the `persist` import and wrapper. In `addItem`, derive `minimum = item.minOrderQuantity ?? 1`, then call `clampToMinimum(quantity, minimum)` before storing or adding to an existing line. In `updateQuantity`, find the current line, derive its minimum, and clamp instead of treating `quantity <= 0` as a deletion. Keep `removeItem` as the only removal mechanism.

- [ ] **Step 4: Run the focused tests.**

Run: `npx vitest run src/core/cart/cartStore.test.ts src/demo/catalogue.test.ts`

Expected: all assertions pass.

- [ ] **Step 5: Commit the local cart behavior.**

```bash
git add src/core/cart/cartStore.ts src/core/cart/cartStore.test.ts
git commit -m "feat: keep Showcase cart local and MOQ-safe"
```

### Task 3: Build the static buyer journey

**Files:**
- Create: `src/showcase/ShowcaseApp.tsx`
- Create: `src/showcase/ShowcaseNotice.tsx`
- Create: `src/showcase/ShowcaseCataloguePage.tsx`
- Create: `src/showcase/ShowcaseProductPage.tsx`
- Create: `src/showcase/ShowcaseCartPage.tsx`
- Create: `src/showcase/ShowcaseCheckoutPage.tsx`

**Interfaces:**
- Consumes: the static catalogue API from Task 1, cart store from Task 2, `formatPrice`, `formatPackageLabel`, and `quantityLabel`.
- Produces: the complete HashRouter route tree with no imports from `src/lib/supabase`, `src/core/auth`, `src/core/admin`, or `src/modules/optional`.

- [ ] **Step 1: Add a failing static-artifact assertion.**

Create `scripts/assert-static-showcase.mjs` that reads every `.js` file below `dist/assets` and exits non-zero when the concatenated output matches either `/supabase\\.co/i` or `/VITE_SUPABASE_(URL|ANON_KEY)/`. Add this package script:

```json
"test:showcase-artifact": "node scripts/assert-static-showcase.mjs"
```

Run:

```bash
VITE_SUPABASE_URL=https://example.supabase.co \\
VITE_SUPABASE_ANON_KEY=test-anon-key \\
npm run build:pages
npm run test:showcase-artifact
```

Expected: the build exits `0`, then the artifact assertion FAILS because the current entry point imports `src/lib/supabase.ts` and embeds `example.supabase.co`.

- [ ] **Step 2: Create the reusable disclosure.**

`ShowcaseNotice` renders a `role="note"` element whose exact text is:

```tsx
Concept demo — ไม่รับคำสั่งซื้อจริง
```

Use it below the header and immediately before the simulated-order action.

- [ ] **Step 3: Create `ShowcaseApp` and its two public catalogue screens.**

Use `HashRouter`, then render only these routes:

```tsx
<Route path="/" element={<ShowcaseCataloguePage mode="home" />} />
<Route path="/shop" element={<ShowcaseCataloguePage mode="shop" />} />
<Route path="/products/:slug" element={<ShowcaseProductPage />} />
<Route path="/cart" element={<ShowcaseCartPage />} />
<Route path="/checkout" element={<ShowcaseCheckoutPage />} />
<Route path="*" element={<Navigate to="/" replace />} />
```

The header contains only the logo/store name, `สินค้า`, and `ตะกร้า` with the live cart count. Home has the existing Thai hero title, three featured local products, and category links. Shop adds a labelled `ค้นหาสินค้า` search input and category buttons; both use `filterDemoProducts`.

- [ ] **Step 4: Implement product detail and cart without network checks.**

The detail page looks up `findDemoProduct(slug)`, renders an image, price, pack label, and `สั่งขั้นต่ำ … ต่อรายการ`, initializes quantity from `minOrderQuantity`, and adds the static record to the cart. An unknown slug renders `ไม่พบสินค้าที่ต้องการ` plus a `/shop` link.

The cart renders items from the store only. It must not call `useProduct`, reconcile remote metadata, or show availability/loading errors. Its quantity input uses each item's `minOrderQuantity`; the remove button uses `removeItem`; the checkout link says `ไปยังการสั่งซื้อจำลอง`.

- [ ] **Step 5: Implement the non-production confirmation.**

For an empty cart, `/checkout` redirects to `/cart`. Otherwise show a Thai order summary and a button `ยืนยันคำสั่งซื้อจำลอง`. On click, build `SM-` plus the last six digits of `Date.now()`, clear the cart, and render a confirmation headed `บันทึกการสาธิตแล้ว`. It states that no order, payment, or customer data was sent or stored and offers `กลับไปดูสินค้า`.

- [ ] **Step 6: Run the task-local quality gate.**

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
```

Expected: all commands exit `0`. Do not run a passing Pages artifact assertion yet: Task 4 replaces `src/main.tsx`, and that entry-point change is what removes the current Supabase build dependency.

- [ ] **Step 7: Commit the static route tree.**

```bash
git add src/showcase scripts/assert-static-showcase.mjs package.json
git commit -m "feat: build SupplyMate static buyer showcase"
```

### Task 4: Point the app and Pages workflow at the static showcase

**Files:**
- Modify: `src/main.tsx`
- Modify: `vite.config.ts`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ShowcaseApp` from Task 3.
- Produces a Pages build with `VITE_DEPLOY_TARGET=github-pages` and `VITE_SHOWCASE_MODE=true`, without Supabase credentials or API calls.

- [ ] **Step 1: Change the entry point to mount only `ShowcaseApp`.**

Replace the QueryClient, AuthProvider, Supabase, and auth-callback bootstrap imports/logic with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyBranding } from '@/config/applyBranding'
import { ShowcaseApp } from '@/showcase/ShowcaseApp'

applyBranding()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShowcaseApp />
  </StrictMode>,
)
```

- [ ] **Step 2: Make the build mode explicit.**

In `vite.config.ts`, add `VITE_SHOWCASE_MODE: JSON.stringify('true')` alongside the existing compile-time target value whenever `deployTarget` is defined. Keep the Pages base path unchanged.

- [ ] **Step 3: Remove Supabase from the Pages deployment workflow.**

Replace the job `env` block with only:

```yaml
env:
  VITE_DEPLOY_TARGET: github-pages
  VITE_SHOWCASE_MODE: 'true'
```

Delete the `Check hosted Supabase configuration` step. Keep the manual trigger, Pages permissions, checkout, Node setup, `npm ci`, `npm run build:pages`, upload, and deploy steps unchanged.

- [ ] **Step 4: Update the deployment status in README.**

Replace the current GitHub Pages release-status paragraph with copy stating that the static concept showcase deploys without Supabase credentials, accounts, payments, or customer data; retain the intended Pages URL.

- [ ] **Step 5: Run the static build and inspect its output.**

Run:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build:pages
npm run test:showcase-artifact
```

Expected: all commands exit `0`, and `dist/assets` has no hosted Supabase URL or environment-key name.

- [ ] **Step 6: Commit the entry/deployment change.**

```bash
git add src/main.tsx vite.config.ts .github/workflows/deploy-pages.yml README.md
git commit -m "chore: deploy SupplyMate as a static showcase"
```

### Task 5: Publish and inspect the showcase

**Files:**
- Modify: `README.md` only if the actual Pages URL differs from the intended URL.

**Interfaces:**
- Consumes: the clean static Pages workflow from Task 4.
- Produces: one manual GitHub Pages deployment with no Supabase secrets used.

- [ ] **Step 1: Verify the committed branch is clean and push the static showcase.**

Run:

```bash
git status --short
git push origin main
```

Expected: no uncommitted code changes before the push; remote `main` advances with the showcase commits.

- [ ] **Step 2: Trigger and watch the manual Pages deployment.**

Run:

```bash
gh workflow run "Deploy GitHub Pages" --repo Phakinza007/ecom
gh run list --repo Phakinza007/ecom --workflow "Deploy GitHub Pages" --limit 1
```

Copy the numeric `databaseId` returned by the second command and pass that exact value to:

```bash
gh run watch 1234567890 --repo Phakinza007/ecom --exit-status
```

Expected: the workflow completes successfully and reports its Pages URL. The numeric argument is the actual `databaseId` from this release, not a literal `1234567890`.

- [ ] **Step 3: Verify the live static artifact.**

Run:

```bash
curl --fail --silent --show-error https://phakinza007.github.io/supplymate-wholesale/ > /tmp/supplymate-live.html
rg -n '<div id="root"></div>' /tmp/supplymate-live.html
```

Use a 375×812 browser viewport to open `#/`, `#/shop`, `#/products/clear-cup-16oz`, `#/cart`, and `#/checkout`. Confirm no horizontal overflow, no browser-console errors, MOQ clamping, and simulated-order confirmation. Do not add the portfolio card until this check passes.

- [ ] **Step 4: Remove obsolete Supabase secrets after the static deployment is verified.**

Run:

```bash
gh secret remove VITE_SUPABASE_URL --repo Phakinza007/ecom
gh secret remove VITE_SUPABASE_ANON_KEY --repo Phakinza007/ecom
gh secret list --repo Phakinza007/ecom
```

Expected: neither Supabase secret appears in the list.

- [ ] **Step 5: Record the verified release.**

Update README only with the actual release date/URL when different from its existing intended URL, then commit it:

```bash
git add README.md
git commit -m "docs: record SupplyMate static showcase release"
git push origin main
```
