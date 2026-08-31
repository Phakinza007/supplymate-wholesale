# Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A flag-gated guided tour that walks a logged-out visitor through the wholesale buying path — categories, search, price tiers, order minimums, cart — highlighting one element at a time and driving the navigation between pages itself.

**Architecture:** An optional module at `src/modules/optional/product-tour/`, mounted once in `SiteLayout` behind `<Feature flag="productTour">` + `lazy()`. Steps address their targets through `data-tour` attributes added to core components (inert HTML, not imports, so the core/optional boundary holds). The three pieces most likely to be wrong — tooltip placement, the auth-dependent step list, and waiting for a target that Supabase has not delivered yet — are pure functions with no DOM or React, unit-tested in the existing node-environment vitest setup.

**Tech Stack:** React 19, TypeScript, React Router 7, Tailwind 4, vitest (node environment), Playwright. **No new runtime or dev dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-31-product-tour-design.md`

## Global Constraints

- **No new dependencies.** Not driver.js, Shepherd, react-joyride, floating-ui, or jsdom. The kit is cloned per client; a dependency added here ships to every clone forever.
- **The tour never operates a control that changes data.** No placing orders, no submitting forms, no writing to the cart store. It highlights and it navigates. The add-to-cart step *waits for* the visitor's click; it never performs one.
- **The tour never asks for or fills credentials.**
- **Core must not import from `src/modules/optional/`.** `scripts/check-core-boundary.mjs` is a text-based regex check that trips even on `import type`. Core files in this plan gain only HTML attributes and one empty `<div>`; they gain no imports.
- **Never write `is_active` on `products`** — irrelevant here, but it is the standing rule for any product query this tour might tempt you to add. The tour adds no queries at all.
- **Money renders through `formatPrice()`**, never `toLocaleString()`. The tour renders no money; if you find yourself adding some, use the helper.
- **Vitest runs in the `node` environment** (`vitest.config.ts` sets no `environment`). There is no `document` in unit tests. Every pure module here is designed to be testable without one — do not reach for jsdom.
- **Run the E2E suite with `npm run test:e2e`, never bare `npx playwright test`** — only the npm script runs `pretest:e2e`, which resets the database. Without the reset, unrelated specs fail on rows left by the previous run and it looks like a regression.
- **Thai copy throughout the UI.** Comments and identifiers in English, matching the codebase.

---

## File Structure

**Created — the optional module** (`src/modules/optional/product-tour/`):

| File | Responsibility |
|---|---|
| `tooltipPosition.ts` | Target rect + viewport + tooltip size → placement and coordinates, clamped inside the viewport. Pure. |
| `tooltipPosition.test.ts` | Every placement, and clamping at all four edges. |
| `tourSteps.ts` | The step list as data: id, route, anchor, copy, how it advances, whether it needs a session. Pure. |
| `stepSequence.ts` | `planSteps()` (drops session-only steps for a logged-out visitor) and `progressLabel()`. Pure. |
| `stepSequence.test.ts` | The auth tail, and progress labels against the *planned* length, not the full list. |
| `stepAnchors.test.ts` | Static guard: every step's anchor exists as a `data-tour="…"` literal under `src/`. |
| `waitFor.ts` | Poll a probe until it returns non-null or the attempt budget runs out. Injectable sleep, so it is testable without timers or a DOM. |
| `waitFor.test.ts` | Resolves late; gives up; returns immediately when already present. |
| `TourOverlay.tsx` | Backdrop with a cut-out, and the tooltip. Presentation and accessibility only — no routing, no state machine. |
| `TourLauncher.tsx` | The "ดูวิธีสั่งซื้อ" control, portalled into the header slot. |
| `index.tsx` | `ProductTour` — the state machine and the lazy entry point. |

**Modified — core** (attributes and one empty div only, no imports):

| File | Change |
|---|---|
| `src/config/branding.config.ts` | `productTour: boolean` on `FeatureFlags`, set `true`. |
| `src/index.css` | `--z-tour: 60` next to the existing `--z-sticky: 20`. |
| `src/components/SiteLayout.tsx` | Mount `<ProductTour />` behind the flag. |
| `src/components/SiteHeader.tsx` | `<div id="tour-launcher-slot" className="contents" />` inside the nav. |
| `src/core/catalog/HomePage.tsx` | `data-tour="home-categories"` on the category section. |
| `src/core/catalog/ProductListPage.tsx` | `data-tour="catalogue-search"` on the search form. |
| `src/core/catalog/ProductCard.tsx` | `data-tour="product-card"` and `data-tour-tiers={tiers.length > 0}` on the link. |
| `src/core/catalog/TierLadder.tsx` | `data-tour="tier-ladder"` on the section. |
| `src/core/catalog/QuantityCalculator.tsx` | `data-tour="quantity"` on its root. |
| `src/core/catalog/ProductDetailPage.tsx` | `data-tour="add-to-cart"` on the add button. |
| `src/core/cart/CartPage.tsx` | `data-tour="cart-summary"` on the totals panel. |
| `src/core/checkout/CheckoutPage.tsx` | `data-tour="payment-methods"` on the payment method group. |

**Created — tests:** `e2e/product-tour.spec.ts`.

**Why the launcher is portalled rather than imported:** the restart control belongs in the site header, but `SiteHeader` is core and may not import an optional module. Core renders an empty, inert `<div id="tour-launcher-slot">`; the tour module fills it with `createPortal`. Flag off, the div stays empty and invisible.

---

### Task 1: Tooltip placement

**Files:**
- Create: `src/modules/optional/product-tour/tooltipPosition.ts`
- Test: `src/modules/optional/product-tour/tooltipPosition.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Placement = 'top' | 'bottom' | 'left' | 'right' | 'sheet'`; `interface Rect { top: number; left: number; width: number; height: number }`; `function tooltipPosition(input: PositionInput): Position` where `PositionInput = { target: Rect; tooltip: { width: number; height: number }; viewport: { width: number; height: number }; headerHeight: number; gap: number }` and `Position = { placement: Placement; top: number; left: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/optional/product-tour/tooltipPosition.test.ts
import { describe, expect, it } from 'vitest'
import { tooltipPosition } from './tooltipPosition'

const desktop = { width: 1280, height: 800 }
const tooltip = { width: 320, height: 160 }
const base = { tooltip, viewport: desktop, headerHeight: 64, gap: 12 }

describe('tooltipPosition', () => {
  it('sits below the target when there is room', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 500, width: 200, height: 50 } })
    expect(r.placement).toBe('bottom')
    expect(r.top).toBe(162) // target bottom (150) + gap
  })

  it('flips above when the target is near the bottom edge', () => {
    const r = tooltipPosition({ ...base, target: { top: 700, left: 500, width: 200, height: 50 } })
    expect(r.placement).toBe('top')
    expect(r.top).toBe(528) // target top (700) - gap - tooltip height
  })

  it('never rides up under the sticky header', () => {
    // Target hugs the top, so "above" would land at a negative offset.
    const r = tooltipPosition({ ...base, target: { top: 70, left: 500, width: 200, height: 700 } })
    expect(r.top).toBeGreaterThanOrEqual(base.headerHeight + base.gap)
  })

  it('clamps against the right edge instead of overflowing', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 1200, width: 60, height: 50 } })
    expect(r.left).toBe(desktop.width - tooltip.width - base.gap)
  })

  it('clamps against the left edge instead of going negative', () => {
    const r = tooltipPosition({ ...base, target: { top: 100, left: 4, width: 40, height: 50 } })
    expect(r.left).toBe(base.gap)
  })

  it('becomes a bottom sheet on a phone regardless of the target', () => {
    const r = tooltipPosition({
      ...base,
      viewport: { width: 375, height: 812 },
      target: { top: 300, left: 20, width: 300, height: 50 },
    })
    expect(r.placement).toBe('sheet')
    expect(r.left).toBe(0)
    expect(r.top).toBe(812 - tooltip.height)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/modules/optional/product-tour/tooltipPosition.test.ts
```

Expected: FAIL — `Failed to resolve import "./tooltipPosition"`.

- [ ] **Step 3: Implement**

```ts
// src/modules/optional/product-tour/tooltipPosition.ts

/**
 * Where the tour's tooltip goes, given where its target ended up.
 *
 * Pure on purpose: placement maths is the part of a hand-rolled tour that
 * actually breaks (tooltips half off-screen, tooltips under the sticky
 * header), and it needs no DOM to check. The caller measures; this decides.
 */

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'sheet'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface PositionInput {
  target: Rect
  tooltip: { width: number; height: number }
  viewport: { width: number; height: number }
  /** The sticky SiteHeader's height. Nothing may be placed underneath it. */
  headerHeight: number
  gap: number
}

export interface Position {
  placement: Placement
  top: number
  left: number
}

/** Below this width there is no room beside a highlighted element. */
const SHEET_BREAKPOINT = 640

function clamp(value: number, min: number, max: number): number {
  // max < min when the tooltip is larger than the space available; the lower
  // bound wins, because the header is the thing that must never be covered.
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

export function tooltipPosition({
  target,
  tooltip,
  viewport,
  headerHeight,
  gap,
}: PositionInput): Position {
  if (viewport.width < SHEET_BREAKPOINT) {
    return { placement: 'sheet', top: viewport.height - tooltip.height, left: 0 }
  }

  const minTop = headerHeight + gap
  const maxTop = viewport.height - tooltip.height - gap
  const below = target.top + target.height + gap
  const above = target.top - gap - tooltip.height

  const placement: Placement = below + tooltip.height <= viewport.height - gap ? 'bottom' : 'top'
  const rawTop = placement === 'bottom' ? below : above

  // Centred on the target, then pulled back inside the viewport.
  const rawLeft = target.left + target.width / 2 - tooltip.width / 2

  return {
    placement,
    top: clamp(rawTop, minTop, maxTop),
    left: clamp(rawLeft, gap, viewport.width - tooltip.width - gap),
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/modules/optional/product-tour/tooltipPosition.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/optional/product-tour/tooltipPosition.ts src/modules/optional/product-tour/tooltipPosition.test.ts
git commit -m "feat(tour): place the tooltip without covering the header or the edge"
```

---

### Task 2: The step list and the auth tail

**Files:**
- Create: `src/modules/optional/product-tour/tourSteps.ts`
- Create: `src/modules/optional/product-tour/stepSequence.ts`
- Test: `src/modules/optional/product-tour/stepSequence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type TourStepId`; `interface TourStep { id: TourStepId; route: string | null; anchor: string; title: string; body: string; advance: 'button' | 'action'; requiresSession?: true }`; `const tourSteps: readonly TourStep[]`; `function planSteps(all: readonly TourStep[], ctx: { hasSession: boolean }): TourStep[]`; `function progressLabel(index: number, total: number): string`.

Note on `route`: `null` means "already on the right page — do not navigate". `'/products/:slug'` is not a route the tour navigates to directly; the product steps carry `route: null` because the tour arrives there by following the card link chosen at runtime in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/optional/product-tour/stepSequence.test.ts
import { describe, expect, it } from 'vitest'
import { tourSteps } from './tourSteps'
import { planSteps, progressLabel } from './stepSequence'

describe('planSteps', () => {
  it('drops the checkout tail for a visitor with no session', () => {
    const plan = planSteps(tourSteps, { hasSession: false })
    expect(plan.some((s) => s.requiresSession)).toBe(false)
    expect(plan.at(-1)?.id).toBe('cart-summary')
  })

  it('keeps the checkout tail for a signed-in visitor', () => {
    const plan = planSteps(tourSteps, { hasSession: true })
    expect(plan.at(-1)?.id).toBe('payment-methods')
  })

  it('leaves the shared steps identical either way', () => {
    const out = planSteps(tourSteps, { hasSession: false }).map((s) => s.id)
    const inn = planSteps(tourSteps, { hasSession: true }).map((s) => s.id)
    expect(inn.slice(0, out.length)).toEqual(out)
  })
})

describe('the step data itself', () => {
  it('starts on the home page and ends in the cart or beyond', () => {
    expect(tourSteps[0].route).toBe('/')
  })

  it('waits for a real click on the add-to-cart step and nowhere else', () => {
    // The tour must never press a data-changing control itself. The only
    // step that involves one is the step that waits for the visitor.
    const waiting = tourSteps.filter((s) => s.advance === 'action').map((s) => s.id)
    expect(waiting).toEqual(['add-to-cart'])
  })

  it('gives every step a distinct id and anchor', () => {
    expect(new Set(tourSteps.map((s) => s.id)).size).toBe(tourSteps.length)
    expect(new Set(tourSteps.map((s) => s.anchor)).size).toBe(tourSteps.length)
  })
})

describe('progressLabel', () => {
  it('counts against the planned length, not the full list', () => {
    // A logged-out visitor sees "3 จาก 7", never "3 จาก 8" for a step they
    // will never reach.
    expect(progressLabel(2, 7)).toBe('ขั้นที่ 3 จาก 7')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/modules/optional/product-tour/stepSequence.test.ts
```

Expected: FAIL — `Failed to resolve import "./tourSteps"`.

- [ ] **Step 3: Implement the step data**

```ts
// src/modules/optional/product-tour/tourSteps.ts

/**
 * The tour, as data.
 *
 * Kept free of DOM and React so the shape of the walkthrough can be reviewed
 * and tested as content. Anchors are `data-tour` values that core components
 * carry; `stepAnchors.test.ts` fails if one of them stops existing.
 */

export type TourStepId =
  | 'home-categories'
  | 'catalogue-search'
  | 'catalogue-tiers'
  | 'tier-ladder'
  | 'quantity'
  | 'add-to-cart'
  | 'cart-summary'
  | 'payment-methods'

export interface TourStep {
  id: TourStepId
  /** Route to navigate to before showing this step; null means stay put. */
  route: string | null
  /** The `data-tour` value this step highlights. */
  anchor: string
  title: string
  body: string
  /** `action` waits for the visitor to do the thing themselves. */
  advance: 'button' | 'action'
  /** Steps behind ProtectedRoute. Dropped entirely for a logged-out visitor. */
  requiresSession?: true
}

export const tourSteps: readonly TourStep[] = [
  {
    id: 'home-categories',
    route: '/',
    anchor: 'home-categories',
    title: 'ร้านนี้ขายอะไร',
    body: 'ของใช้ร้านอาหารและคาเฟ่ แบ่งตามหมวด เลือกหมวดเพื่อดูเฉพาะกลุ่มที่สนใจ',
    advance: 'button',
  },
  {
    id: 'catalogue-search',
    route: '/shop',
    anchor: 'catalogue-search',
    title: 'หาของที่ต้องการ',
    body: 'พิมพ์ชื่อสินค้าเพื่อค้นหา หรือกรองตามหมวดและการเรียงลำดับ ตัวเลือกทั้งหมดติดอยู่ใน URL แชร์หรือกดย้อนกลับได้',
    advance: 'button',
  },
  {
    id: 'catalogue-tiers',
    route: null,
    anchor: 'catalogue-tiers',
    title: 'สั่งมากขึ้น ราคาต่อหน่วยถูกลง',
    body: 'สินค้าที่มีป้ายนี้ตั้งราคาไว้เป็นขั้นตามจำนวน กดเข้าไปดูขั้นราคาทั้งหมดกัน',
    advance: 'button',
  },
  {
    id: 'tier-ladder',
    route: null,
    anchor: 'tier-ladder',
    title: 'ขั้นราคาทั้งหมดอยู่ตรงนี้',
    body: 'ระบบเลือกขั้นที่ตรงกับจำนวนในตะกร้าให้เองตอนสั่งซื้อ ไม่ต้องโทรถามหรือแจ้งพนักงาน',
    advance: 'button',
  },
  {
    id: 'quantity',
    route: null,
    anchor: 'quantity',
    title: 'ขายเป็นลัง ไม่ใช่เป็นชิ้น',
    body: 'ปรับจำนวนแล้วดูราคาต่อชิ้นขยับตาม สินค้าบางตัวมีขั้นต่ำ สั่งน้อยกว่านั้นไม่ได้',
    advance: 'button',
  },
  {
    id: 'add-to-cart',
    route: null,
    anchor: 'add-to-cart',
    title: 'ลองกดเพิ่มลงตะกร้าดู',
    body: 'กดปุ่มนี้เองได้เลย ทัวร์รอตรงนี้ก่อน — จะได้เห็นว่าตะกร้าคิดราคาขั้นบันไดให้จริง',
    advance: 'action',
  },
  {
    id: 'cart-summary',
    route: '/cart',
    anchor: 'cart-summary',
    title: 'ยอดรวมคิดจากขั้นที่ได้จริง',
    body: 'ถัดจากนี้คือเข้าสู่ระบบ เลือกที่อยู่จัดส่ง เลือกวิธีชำระเงิน แล้วแนบสลิป ระบบคิดค่าส่งและ VAT ให้ตอนสั่งซื้อ',
    advance: 'button',
  },
  {
    id: 'payment-methods',
    route: '/checkout',
    anchor: 'payment-methods',
    title: 'เลือกวิธีชำระเงิน',
    body: 'โอนผ่านธนาคาร พร้อมเพย์ หรือเก็บเงินปลายทาง ทัวร์จบตรงนี้ ไม่กดสั่งซื้อให้',
    advance: 'button',
    requiresSession: true,
  },
]
```

- [ ] **Step 4: Implement the sequence helpers**

```ts
// src/modules/optional/product-tour/stepSequence.ts
import type { TourStep } from './tourSteps'

/**
 * The tour must run start to finish without a login, so steps behind
 * ProtectedRoute are removed from the plan rather than shown and skipped —
 * a visitor should never see "ขั้นที่ 7 จาก 8" for a step they cannot reach.
 */
export function planSteps(
  all: readonly TourStep[],
  { hasSession }: { hasSession: boolean },
): TourStep[] {
  return all.filter((step) => !step.requiresSession || hasSession)
}

export function progressLabel(index: number, total: number): string {
  return `ขั้นที่ ${index + 1} จาก ${total}`
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx vitest run src/modules/optional/product-tour/stepSequence.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/optional/product-tour/tourSteps.ts src/modules/optional/product-tour/stepSequence.ts src/modules/optional/product-tour/stepSequence.test.ts
git commit -m "feat(tour): define the buyer walkthrough and drop its checkout tail without a session"
```

---

### Task 3: Waiting for a target Supabase has not delivered yet

**Files:**
- Create: `src/modules/optional/product-tour/waitFor.ts`
- Test: `src/modules/optional/product-tour/waitFor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function waitFor<T>(probe: () => T | null, options?: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<T | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/optional/product-tour/waitFor.test.ts
import { describe, expect, it, vi } from 'vitest'
import { waitFor } from './waitFor'

const instant = () => Promise.resolve()

describe('waitFor', () => {
  it('returns immediately when the value is already there', async () => {
    const probe = vi.fn(() => 'here')
    expect(await waitFor(probe, { attempts: 5, sleep: instant })).toBe('here')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('keeps probing until the value shows up', async () => {
    let calls = 0
    const probe = () => (++calls < 4 ? null : 'late')
    expect(await waitFor(probe, { attempts: 10, sleep: instant })).toBe('late')
    expect(calls).toBe(4)
  })

  it('gives up rather than hanging when the value never arrives', async () => {
    // A tour that waits forever on a slow query is worse than one that
    // skips the step, so the budget is finite and the result is null.
    const probe = vi.fn(() => null)
    expect(await waitFor(probe, { attempts: 3, sleep: instant })).toBeNull()
    expect(probe).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/modules/optional/product-tour/waitFor.test.ts
```

Expected: FAIL — `Failed to resolve import "./waitFor"`.

- [ ] **Step 3: Implement**

```ts
// src/modules/optional/product-tour/waitFor.ts

/**
 * Poll `probe` until it returns something, or the attempt budget runs out.
 *
 * The tour runs against a Supabase-backed app, so a step's anchor may simply
 * not exist yet when the tour arrives. `sleep` is injectable so this is
 * testable in the node environment without fake timers, and the budget is
 * counted in attempts rather than wall-clock so the tests are deterministic.
 *
 * Returning null is a normal outcome, not an error: the caller skips the step.
 */
export async function waitFor<T>(
  probe: () => T | null,
  {
    attempts = 40,
    intervalMs = 50,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const found = probe()
    if (found !== null && found !== undefined) return found
    if (i < attempts - 1) await sleep(intervalMs)
  }
  return null
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/modules/optional/product-tour/waitFor.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/optional/product-tour/waitFor.ts src/modules/optional/product-tour/waitFor.test.ts
git commit -m "feat(tour): wait for a late target, then skip rather than hang"
```

---

### Task 4: Anchors in core, and a guard against anchor drift

**Files:**
- Modify: `src/core/catalog/HomePage.tsx:37`
- Modify: `src/core/catalog/ProductListPage.tsx:83`
- Modify: `src/core/catalog/ProductCard.tsx:22`
- Modify: `src/core/catalog/TierLadder.tsx:38`
- Modify: `src/core/catalog/QuantityCalculator.tsx`
- Modify: `src/core/catalog/ProductDetailPage.tsx:214`
- Modify: `src/core/cart/CartPage.tsx:95`
- Modify: `src/core/checkout/CheckoutPage.tsx`
- Test: `src/modules/optional/product-tour/stepAnchors.test.ts`

**Interfaces:**
- Consumes: `tourSteps` from Task 2.
- Produces: `data-tour` attributes in core; `data-tour-tiers="true"` on product cards that have price tiers, which Task 6 uses to choose which product to open.

**Why a static test:** this project has been bitten three times by a spec waiting on renamed markup, and each time it presented as a 60-second timeout rather than an assertion failure. An anchor that gets renamed or deleted should fail in a one-second unit test naming the anchor, not in a Playwright run that says only "timed out".

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/optional/product-tour/stepAnchors.test.ts
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { tourSteps } from './tourSteps'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

const src = path.resolve(import.meta.dirname, '../../..')
const allSource = sourceFiles(src)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

describe('every tour anchor exists in the app', () => {
  // A renamed anchor otherwise surfaces as a silent skip at runtime, or as an
  // unexplained Playwright timeout. Name it here instead.
  it.each(tourSteps.map((s) => [s.id, s.anchor]))(
    'step %s anchors on data-tour="%s"',
    (_id, anchor) => {
      expect(allSource).toContain(`data-tour="${anchor}"`)
    },
  )

  it('marks cards that carry price tiers so the tour can pick one', () => {
    expect(allSource).toContain('data-tour-tiers')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run src/modules/optional/product-tour/stepAnchors.test.ts
```

Expected: FAIL — 9 failures, one per anchor, each reporting the missing `data-tour="…"` string.

- [ ] **Step 3: Add the anchors**

`src/core/catalog/HomePage.tsx` — the category section (line 37):

```tsx
      <section aria-labelledby="category-title" data-tour="home-categories" className="space-y-10">
```

`src/core/catalog/ProductListPage.tsx` — the search form (line 83):

```tsx
        <form onSubmit={handleSearchSubmit} data-tour="catalogue-search" className="flex gap-2">
```

`src/core/catalog/ProductCard.tsx` — the card link (line 22). Note `data-tour-tiers` is set only when true, so `[data-tour-tiers]` alone is a sufficient selector:

```tsx
    <Link
      to={`/products/${product.slug}`}
      data-tour="catalogue-tiers"
      data-tour-tiers={tiers.length > 0 ? 'true' : undefined}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-input"
    >
```

`src/core/catalog/TierLadder.tsx` — the section (line 38):

```tsx
    <section className="flex flex-col gap-3" data-tour="tier-ladder" aria-labelledby="tier-ladder-heading">
```

`src/core/catalog/QuantityCalculator.tsx` — add `data-tour="quantity"` to the component's outermost element.

`src/core/catalog/ProductDetailPage.tsx` — the add button (line 214):

```tsx
            <Button
              data-tour="add-to-cart"
              disabled={addToCartDisabled}
```

`src/core/cart/CartPage.tsx` — the totals panel containing `ยอดรวมสินค้า` (around line 95): add `data-tour="cart-summary"` to the element wrapping the summary rows and the checkout link.

`src/core/checkout/CheckoutPage.tsx` — add `data-tour="payment-methods"` to the element wrapping the payment-method radio group.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run src/modules/optional/product-tour/stepAnchors.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Confirm the boundary check still passes**

Core gained attributes, not imports, so this must stay green.

```bash
npm run lint && npm run typecheck
```

Expected: `core/optional boundary OK`, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/core src/modules/optional/product-tour/stepAnchors.test.ts
git commit -m "feat(tour): anchor tour steps on data-tour attributes, guarded by a static test"
```

---

### Task 5: The overlay

**Files:**
- Create: `src/modules/optional/product-tour/TourOverlay.tsx`
- Modify: `src/index.css` (add `--z-tour` beside `--z-sticky`)

**Interfaces:**
- Consumes: `tooltipPosition`, `Rect`, `Position` (Task 1); `progressLabel` (Task 2).
- Produces: `function TourOverlay(props: { title: string; body: string; targetRect: Rect | null; index: number; total: number; waitingForAction: boolean; onNext: () => void; onPrev: () => void; onSkip: () => void; onClose: () => void }): JSX.Element`.

**Accessibility requirements — all of these, not a subset:**
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title.
- Focus moves into the tooltip when the step changes; Tab cycles within it; Escape calls `onClose`.
- The backdrop and the cut-out are `aria-hidden="true"` — decoration, never focusable.
- Progress announced through `progressLabel()` in an `aria-live="polite"` region.
- `prefers-reduced-motion` removes transitions; the tour cuts between steps instead of sliding.
- Controls are `min-h-11 sm:min-h-9`, matching the project's touch-target rule.
- **No timer.** The overlay never closes or advances itself — same reasoning as `toaster.tsx`.

- [ ] **Step 1: Add the z-index token**

In `src/index.css`, beside the existing `--z-sticky: 20`:

```css
  /* Above --z-sticky (20): the site header is sticky, and a backdrop beneath
     it would leave the header lit and clickable while the rest of the page is
     dimmed, which reads as a rendering fault rather than a spotlight. */
  --z-tour: 60;
```

- [ ] **Step 2: Implement the overlay**

Build it as four SVG-free parts: four `absolute` divs forming the dim around the target rect (a cut-out without `clip-path`, so it degrades predictably), plus the tooltip positioned by `tooltipPosition()`. When `targetRect` is null the dim covers the viewport and the tooltip centres — the state used while a target is still resolving.

```tsx
// src/modules/optional/product-tour/TourOverlay.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { progressLabel } from './stepSequence'
import { tooltipPosition, type Position, type Rect } from './tooltipPosition'

const GAP = 12

export function TourOverlay({
  title,
  body,
  targetRect,
  index,
  total,
  waitingForAction,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: {
  title: string
  body: string
  targetRect: Rect | null
  index: number
  total: number
  waitingForAction: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onClose: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  useLayoutEffect(() => {
    const node = tooltipRef.current
    if (!node) return
    const header = document.querySelector('header')
    setPosition(
      tooltipPosition({
        target: targetRect ?? { top: 0, left: 0, width: window.innerWidth, height: 0 },
        tooltip: { width: node.offsetWidth, height: node.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        headerHeight: header?.getBoundingClientRect().height ?? 0,
        gap: GAP,
      }),
    )
  }, [targetRect, title, body])

  // Focus follows the step, so a keyboard or screen-reader user is taken to
  // the new text rather than left behind on the previous step's button.
  useEffect(() => {
    tooltipRef.current?.focus()
  }, [index])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusables = tooltipRef.current?.querySelectorAll<HTMLElement>('button')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[var(--z-tour)]" data-tour-overlay>
      <div aria-hidden="true" className="absolute inset-0" onClick={onClose}>
        {targetRect && (
          <div
            className="absolute rounded-md ring-2 ring-primary"
            style={{
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)',
            }}
          />
        )}
        {!targetRect && <div className="absolute inset-0 bg-black/55" />}
      </div>

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-border bg-card p-4 shadow-lg outline-none max-sm:w-full max-sm:rounded-b-none motion-reduce:transition-none"
        style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      >
        <p aria-live="polite" className="text-xs font-semibold text-muted-foreground">
          {progressLabel(index, total)}
        </p>
        <h2 id="tour-title" className="mt-1 font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {index > 0 && (
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onPrev}>
              ย้อนกลับ
            </Button>
          )}
          {waitingForAction ? (
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onSkip}>
              ข้าม
            </Button>
          ) : (
            <Button className="min-h-11 sm:min-h-9" onClick={onNext}>
              {index === total - 1 ? 'จบทัวร์' : 'ถัดไป'}
            </Button>
          )}
          <Button variant="ghost" className="ml-auto min-h-11 sm:min-h-9" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Check it compiles and lints**

```bash
npm run typecheck && npm run lint
```

Expected: no errors. If `Button` does not accept `variant="ghost"` or `variant="outline"`, read `src/components/ui/button.tsx` and use the variants it actually defines rather than adding new ones.

- [ ] **Step 4: Commit**

```bash
git add src/modules/optional/product-tour/TourOverlay.tsx src/index.css
git commit -m "feat(tour): spotlight overlay with focus handling and no self-dismissal"
```

---

### Task 6: The state machine, the launcher, and the mount

**Files:**
- Create: `src/modules/optional/product-tour/TourLauncher.tsx`
- Create: `src/modules/optional/product-tour/index.tsx`
- Modify: `src/config/branding.config.ts`
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/components/SiteLayout.tsx`

**Interfaces:**
- Consumes: `tourSteps` and `planSteps` (Task 2), `waitFor` (Task 3), `TourOverlay` (Task 5), `useAuth()` from `@/core/auth/AuthProvider`.
- Produces: default export `ProductTour` from `src/modules/optional/product-tour/index.tsx`.

**Behaviour, precisely:**

1. On mount, start automatically **only** when all three hold: no `localStorage['supplymate-tour-seen-v1']`, the current path is `/`, and the flag is on. Any deep link suppresses the auto-start.
2. Entering step `i`: if `step.route` is set and differs from the current path, navigate. Then `waitFor(() => document.querySelector('[data-tour="…"]'))`. If it resolves, measure with `getBoundingClientRect()` and show. If it returns null, move to `i + 1` and repeat. Past the end, finish.
3. The `catalogue-tiers` step additionally resolves `[data-tour-tiers]` first and falls back to `[data-tour="catalogue-tiers"]`; entering the following step follows that element's `href` via `navigate()`. If no tiered card exists, `catalogue-tiers` and `tier-ladder` both resolve to nothing and are skipped by rule 2 — no special case needed.
4. The `add-to-cart` step sets `waitingForAction`. It advances when the cart's item count rises, observed through `useCartTotalItems()` — not by attaching a click handler to the button, which would be reaching into a control the tour may not operate.
5. Finishing or closing writes `localStorage['supplymate-tour-seen-v1'] = '1'`.
6. Re-measure the target on `resize` and `scroll`.
7. `planSteps(tourSteps, { hasSession: Boolean(session) })` is computed **once when the tour starts**, so a session appearing mid-tour cannot renumber the steps under the visitor.

- [ ] **Step 1: Add the flag**

In `src/config/branding.config.ts`, add to `interface FeatureFlags`:

```ts
  productTour: boolean
```

and to the `features` object:

```ts
    productTour: true,
```

- [ ] **Step 2: Add the launcher slot to the header**

In `src/components/SiteHeader.tsx`, inside the `<nav aria-label="การนำทางหลัก">`, after the `/shop` link:

```tsx
          {/* Filled by the product-tour module via a portal. Core may not
              import an optional module, so it renders the slot and nothing
              else; with the flag off this stays empty. */}
          <div id="tour-launcher-slot" className="contents" />
```

- [ ] **Step 3: Implement the launcher**

```tsx
// src/modules/optional/product-tour/TourLauncher.tsx
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

export function TourLauncher({ onStart }: { onStart: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  // The slot is rendered by SiteHeader, which may mount after this module
  // finishes loading lazily, so look it up in an effect rather than at render.
  useEffect(() => {
    setSlot(document.getElementById('tour-launcher-slot'))
  }, [])

  if (!slot) return null
  return createPortal(
    <button
      type="button"
      onClick={onStart}
      className="min-h-11 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:text-foreground sm:min-h-9"
    >
      ดูวิธีสั่งซื้อ
    </button>,
    slot,
  )
}
```

- [ ] **Step 4: Implement the state machine**

```tsx
// src/modules/optional/product-tour/index.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/core/auth/AuthProvider'
import { useCartTotalItems } from '@/core/cart/cartStore'
import { TourLauncher } from './TourLauncher'
import { TourOverlay } from './TourOverlay'
import { planSteps } from './stepSequence'
import { tourSteps, type TourStep } from './tourSteps'
import type { Rect } from './tooltipPosition'
import { waitFor } from './waitFor'

const SEEN_KEY = 'supplymate-tour-seen-v1'

/** localStorage throws in some privacy modes; a tour is never worth a crash. */
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
function recalls(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return true // treat an unreadable store as "already seen": never nag.
  }
}

function anchorNode(step: TourStep): HTMLElement | null {
  // The tier step wants a product that genuinely has a ladder. If the
  // catalogue has none, this resolves to nothing and the step skips itself --
  // and so does the ladder step that follows it.
  if (step.id === 'catalogue-tiers') {
    return document.querySelector<HTMLElement>('[data-tour-tiers]')
  }
  return document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`)
}

function toRect(node: HTMLElement): Rect {
  const { top, left, width, height } = node.getBoundingClientRect()
  return { top, left, width, height }
}

export default function ProductTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const cartCount = useCartTotalItems()

  const [plan, setPlan] = useState<TourStep[] | null>(null)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const nodeRef = useRef<HTMLElement | null>(null)
  const cartOnEntry = useRef(0)

  const step = plan?.[index] ?? null

  const stop = useCallback(() => {
    remember(SEEN_KEY, '1')
    setPlan(null)
    setRect(null)
    nodeRef.current = null
  }, [])

  const start = useCallback(() => {
    // Frozen at start: a session arriving mid-tour must not renumber the
    // steps under the visitor.
    setPlan(planSteps(tourSteps, { hasSession: Boolean(session) }))
    setIndex(0)
  }, [session])

  // Auto-start once, and only for someone who came in the front door. Mount-only
  // by design: navigating to "/" later in a session is not a first visit.
  useEffect(() => {
    if (!recalls(SEEN_KEY) && location.pathname === '/') start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enter a step: navigate if it names a route, wait for its anchor, and move
  // on if the anchor never arrives. Skipping beats hanging on a slow query.
  useEffect(() => {
    if (!plan || !step) return
    let cancelled = false
    setRect(null)
    nodeRef.current = null

    if (step.route && step.route !== location.pathname) navigate(step.route)

    void waitFor(() => anchorNode(step)).then((node) => {
      if (cancelled) return
      if (!node) {
        if (index + 1 < plan.length) setIndex(index + 1)
        else stop()
        return
      }
      nodeRef.current = node
      node.scrollIntoView({ block: 'center', behavior: 'auto' })
      cartOnEntry.current = cartCount
      setRect(toRect(node))
    })

    return () => {
      cancelled = true
    }
    // `cartCount` is read, not depended on: re-running this on every cart
    // change would restart the step the visitor is being asked to complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, index, step])

  // Keep the spotlight on the target while the page moves under it.
  useEffect(() => {
    if (!plan) return
    const remeasure = () => {
      if (nodeRef.current) setRect(toRect(nodeRef.current))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [plan])

  const advance = useCallback(() => {
    if (!plan || !step) return
    // Leaving the catalogue step means opening the product it highlighted.
    // The tour follows the link; it does not fabricate a slug.
    if (step.id === 'catalogue-tiers') {
      const href = nodeRef.current?.getAttribute('href')
      if (href) navigate(href)
    }
    if (index + 1 < plan.length) setIndex(index + 1)
    else stop()
  }, [plan, step, index, navigate, stop])

  // The add-to-cart step advances when the cart actually grows -- observed,
  // not intercepted. The tour never presses a control that changes data.
  const waitingForAction = step?.advance === 'action'
  useEffect(() => {
    if (waitingForAction && cartCount > cartOnEntry.current) advance()
  }, [waitingForAction, cartCount, advance])

  return (
    <>
      <TourLauncher onStart={start} />
      {plan && step && (
        <TourOverlay
          title={step.title}
          body={step.body}
          targetRect={rect}
          index={index}
          total={plan.length}
          waitingForAction={waitingForAction}
          onNext={advance}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onSkip={advance}
          onClose={stop}
        />
      )}
    </>
  )
}
```

Two details worth not "simplifying" later: the step effect deliberately omits `cartCount` from its dependencies (re-entering the step every time the cart changes would reset the very step asking the visitor to change it), and `recalls()` treats an unreadable `localStorage` as *seen* rather than unseen, so a privacy-mode visitor is never nagged on every page load.

- [ ] **Step 5: Mount it**

In `src/components/SiteLayout.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { SiteHeader } from '@/components/SiteHeader'
import { Toaster } from '@/components/ui/toaster'
import { Feature } from '@/lib/Feature'

const ProductTour = lazy(() => import('@/modules/optional/product-tour'))

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <Toaster />
        <Outlet />
      </main>
      <Feature flag="productTour">
        <Suspense fallback={null}>
          <ProductTour />
        </Suspense>
      </Feature>
    </div>
  )
}
```

- [ ] **Step 6: Verify the boundary check still passes**

`SiteLayout` now imports from `@/modules/optional/`, which is exactly what `check-core-boundary.mjs` forbids in `src/core`. `src/components/` is not `src/core/`, so this is allowed — the same arrangement `CheckoutPage` uses for `PromoCodeField`. Confirm rather than assume:

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: `core/optional boundary OK`, clean build.

- [ ] **Step 7: Commit**

```bash
git add src/modules/optional/product-tour src/config/branding.config.ts src/components/SiteHeader.tsx src/components/SiteLayout.tsx
git commit -m "feat(tour): drive the walkthrough, skip absent targets, wait for the visitor's own click"
```

---

### Task 7: End-to-end coverage

**Files:**
- Create: `e2e/product-tour.spec.ts`

**Interfaces:**
- Consumes: everything above; `brandConfig` from `../src/config/branding.config`.
- Produces: nothing.

Follows the module convention: a permanent spec guarded by the flag, so it activates the moment a client turns the flag on.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'

test.skip(!brandConfig.features.productTour, 'the product tour is off for this client')

test('a visitor with no account can take the whole tour', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('ร้านนี้ขายอะไร')

  // Walk forward until the tour asks the visitor to act.
  await dialog.getByRole('button', { name: 'ถัดไป' }).click()
  await expect(page).toHaveURL(/\/shop/)

  for (let i = 0; i < 4; i++) {
    const next = dialog.getByRole('button', { name: 'ถัดไป' })
    if (await dialog.getByRole('button', { name: 'ข้าม' }).isVisible()) break
    await next.click()
  }

  // The waiting step advances only when the visitor themselves adds an item.
  await expect(dialog).toContainText('ลองกดเพิ่มลงตะกร้าดู')
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click()
  await expect(page).toHaveURL(/\/cart/)
  await expect(dialog).toContainText('ยอดรวมคิดจากขั้นที่ได้จริง')

  // The tour ends at the cart for a logged-out visitor: no checkout step.
  await expect(dialog.getByRole('button', { name: 'จบทัวร์' })).toBeVisible()
  await dialog.getByRole('button', { name: 'จบทัวร์' }).click()
  await expect(dialog).toHaveCount(0)

  // The whole point of the safety rule: nothing was ordered.
  await expect(page).not.toHaveURL(/\/orders\//)
})

test('escape closes the tour and it does not come back on the next visit', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // But it is always available again on request.
  await page.getByRole('button', { name: 'ดูวิธีสั่งซื้อ' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('a deep link is never hijacked into the tour', async ({ page }) => {
  // Someone opening a shared cart URL must not be yanked back to the home page.
  await page.goto('/cart')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/cart/)
})
```

- [ ] **Step 2: Run it**

```bash
npm run test:e2e
```

Expected: all specs pass, including the three new ones. If a new spec times out, open `test-results/*/error-context.md` before calling it a flake — in this codebase a stale locator has presented as a 60-second timeout three separate times.

- [ ] **Step 3: Commit**

```bash
git add e2e/product-tour.spec.ts
git commit -m "test(tour): cover the logged-out walkthrough, escape, and deep-link suppression"
```

---

### Task 8: Document it

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Product tour" section**

Record the decisions a future contributor would otherwise re-derive: that the tour is an optional module gated by `productTour`; that anchors are `data-tour` attributes guarded by `stepAnchors.test.ts`; that the launcher is portalled into `#tour-launcher-slot` because core may not import optional; that a step whose anchor never resolves is skipped rather than waited on; that the tour never operates a data-changing control, and the add-to-cart step advances by watching `useCartTotalItems()` rather than by hooking the button; and that `/checkout` steps are dropped entirely without a session because the tour must run without a login.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the product tour's boundaries and anchor contract"
```
