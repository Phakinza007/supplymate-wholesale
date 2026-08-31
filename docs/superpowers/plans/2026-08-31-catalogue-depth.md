# Catalogue Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow both catalogues to one shared 36-product set (6 categories × 6 products) with a distinct illustration per product, so the site reads as a working wholesale supplier rather than a six-item demo.

**Architecture:** One JSON file (`src/demo/catalogue.data.json`) becomes the single source of truth for categories and products. Two generator scripts read it: one writes a per-product SVG into `public/images/supplymate/products/`, the other rewrites a marked block inside `supabase/seed.sql`. The static showcase reads the same JSON through a typed loader (`src/demo/catalogue.ts`). Both generators support `--check` and run inside `npm run lint`, so the showcase, the generated art, and the Supabase seed can never drift apart silently.

**Tech Stack:** TypeScript + React (Vite), plain-ESM Node scripts (`scripts/*.mjs`, no new dependencies), Vitest, Playwright, Supabase/Postgres SQL seed.

**Spec:** `PRODUCT.md` (product purpose, anti-references, design principles) plus the three scope decisions taken with the user before this plan was written, recorded here:

1. **Both catalogues grow and stay in sync.** The static showcase and the Supabase seed become one catalogue, not two.
2. **Per-product SVG illustrations.** One small generated SVG per product; the six existing photographic PNGs stay, but move to category tiles and the hero only.
3. **36 products, six per category.**

## Global Constraints

- **No new npm dependencies.** This kit is cloned per client; a package added for one generator script ships to every clone. Generators are plain `.mjs` using only `node:fs` / `node:path`.
- **`PRODUCT.md` anti-references hold.** No fabricated stock claims in showcase copy, no shipping promises, no reviews, no discount-marketplace treatment. `stock_quantity` numbers exist only in the Supabase seed, where they already existed, and are never surfaced as scarcity messaging.
- **`clear-cup-16oz` keeps `package_unit = 'carton'`, `units_per_package = 1000`, `min_order_quantity = 1`, and `sort_order = 1`.** `e2e/supplymate-data-contract.spec.ts` asserts the pack facts; several specs buy "the first product on `/shop`", which sorts by `sort_order asc`.
- **Product UUIDs `b1000000-0000-0000-0000-0000000000{01..18}` and category UUIDs `a1000000-0000-0000-0000-00000000000{1..6}` must keep their exact current values.** The seeded sample orders and product variants at the bottom of `supabase/seed.sql` reference them by id.
- **Client code never writes `products.is_active`** (`trg_products_sync_is_active` derives it from `status`). Generated SQL writes `status` only.
- **`sku` is `unique` and nullable — never write `''`.** Every one of the 36 products carries a distinct non-empty SKU.
- **Money renders through `formatPrice()`**, never `toLocaleString()` directly.
- **Showcase typography uses the `showcase-*` token classes**, never Tailwind `text-*`/`font-*` size or weight utilities. Tailwind still handles layout.
- **Generated SVGs must be fully self-contained**: no external font files, no `<image href>`, no remote references. Captions use Latin characters and digits only, in a generic `system-ui` stack — Thai glyphs inside an `<img>`-loaded SVG cannot be relied on.
- **Always run `npm run test:e2e`, never bare `npx playwright test`** — only the npm script runs `pretest:e2e` (`supabase start` + `db reset`).

---

## File Structure

**New files**

| File | Responsibility |
| --- | --- |
| `src/demo/catalogue.data.json` | The catalogue itself: 6 categories, 36 products, each with a small `art` spec. The only place product facts are written. |
| `src/demo/catalogue.data.test.ts` | Structural guarantees on the JSON: six per category, unique ids/slugs/SKUs, valid package units, sane pack facts. |
| `scripts/productArt.mjs` | Pure SVG renderer: a shape vocabulary (`cup`, `lid`, `bag`, `roll`, …) plus `renderProductArt(spec)`. No filesystem access, so it is unit-testable. |
| `scripts/productArt.test.mjs` | Unit tests for the renderer: valid single-root SVG, correct viewBox, caption present, no external references, every shape draws something. |
| `scripts/generate-product-art.mjs` | Reads the JSON, writes `public/images/supplymate/products/{slug}.svg`. `--check` fails instead of writing. |
| `scripts/generate-seed-catalogue.mjs` | Reads the JSON, rewrites the marked catalogue block in `supabase/seed.sql`. `--check` fails instead of writing. |
| `src/demo/catalogueArt.test.ts` | Coverage: every product has an SVG on disk, and the directory holds no orphans. |
| `public/images/supplymate/products/*.svg` | 36 generated files. Committed output — regenerate, never hand-edit. |

**Modified files**

| File | Change |
| --- | --- |
| `src/demo/catalogue.ts` | Becomes a typed loader over the JSON. Public API (`demoCategories`, `demoProducts`, `findDemoProduct`, `filterDemoProducts`, `clampToMinimum`) is preserved; `DemoProduct` gains `sku`, `DemoCategory` gains `description` and `imagePath`. |
| `src/demo/catalogue.test.ts` | Existing assertions updated for a catalogue where several products match "แก้ว". |
| `tsconfig.app.json` | Add `"resolveJsonModule": true`. |
| `package.json` | Add `generate:catalogue`; extend `lint` with both `--check` runs. |
| `supabase/seed.sql` | Categories / products / product_images replaced by the generated block; variants, addresses and sample orders stay hand-written below it. |
| `src/showcase/ShowcaseCataloguePage.tsx` | Category tiles use the category photo; the home page shows a featured six with a link to the full catalogue instead of listing everything. |
| `src/showcase/ShowcaseProductPage.tsx` | Passes `sku` to `WholesaleFacts`; adds a "same category" section. |
| `src/showcase/WholesaleFacts.tsx` | Optional `sku` row. |
| `src/showcase/showcase.css` | One section-spacing rule for the related-products block. |
| `e2e/static-showcase.spec.ts` | Product name and label-product slug/MOQ updated to the unified catalogue. |
| `CLAUDE.md` | New "Catalogue data" section documenting the generated pipeline. |

**Why the data is JSON and not TypeScript:** the two generators are plain Node ESM and cannot import a `.ts` module, while the showcase needs typed access. JSON is the one format both sides read without a build step or a fragile SQL/TS parser.

---

### Task 1: Catalogue data source of truth

Creates the 36-product dataset and the structural test that guards it. Nothing consumes it yet, so the site is unchanged and every existing test stays green.

**Files:**
- Create: `src/demo/catalogue.data.json`
- Create: `src/demo/catalogue.data.test.ts`
- Modify: `tsconfig.app.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `catalogue.data.json` with the shape
  `{ categories: Array<{id: string, slug: string, name: string, description: string, imagePath: string, sortOrder: number}>, products: Array<{id: string, categorySlug: string, slug: string, name: string, description: string, price: number, sku: string, stockQuantity: number, hasVariants: boolean, sortOrder: number, packageUnit: 'carton'|'pack'|'roll'|'case', unitsPerPackage: number, minOrderQuantity: number, art: {shape: string, caption: string, options?: Record<string, string|number|boolean>}}> }`.
  Tasks 2, 3 and 4 all read exactly this shape. A product's image path is **derived**, never stored: `/images/supplymate/products/{slug}.svg`.

- [ ] **Step 1: Enable JSON imports**

In `tsconfig.app.json`, add `"resolveJsonModule": true` directly under `"allowArbitraryExtensions": true`:

```json
    "allowArbitraryExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
```

- [ ] **Step 2: Write the failing structural test**

Create `src/demo/catalogue.data.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import catalogue from './catalogue.data.json'

const PACKAGE_UNITS = new Set(['carton', 'pack', 'roll', 'case'])

describe('catalogue.data.json', () => {
  it('gives every category exactly six products', () => {
    const counts = new Map<string, number>()
    for (const product of catalogue.products) {
      counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1)
    }

    expect(catalogue.categories.map((category) => [category.slug, counts.get(category.slug) ?? 0]))
      .toEqual(catalogue.categories.map((category) => [category.slug, 6]))
    expect(catalogue.products).toHaveLength(36)
  })

  it('keeps every product inside a declared category', () => {
    const known = new Set(catalogue.categories.map((category) => category.slug))
    const strays = catalogue.products.filter((product) => !known.has(product.categorySlug))
    expect(strays.map((product) => product.slug)).toEqual([])
  })

  it('keeps ids, slugs, SKUs and sort orders unique', () => {
    const unique = (values: string[]) => new Set(values).size === values.length
    expect(unique(catalogue.products.map((product) => product.id))).toBe(true)
    expect(unique(catalogue.products.map((product) => product.slug))).toBe(true)
    expect(unique(catalogue.products.map((product) => product.sku))).toBe(true)
    expect(unique(catalogue.categories.map((category) => category.id))).toBe(true)
    expect(catalogue.products.map((product) => product.sortOrder))
      .toEqual(Array.from({ length: 36 }, (_, index) => index + 1))
  })

  it('states pack facts a wholesale buyer can act on', () => {
    for (const product of catalogue.products) {
      expect(PACKAGE_UNITS.has(product.packageUnit)).toBe(true)
      expect(product.unitsPerPackage).toBeGreaterThan(0)
      expect(product.minOrderQuantity).toBeGreaterThanOrEqual(1)
      // Nothing may be listed below its own order minimum.
      expect(product.stockQuantity).toBeGreaterThanOrEqual(product.minOrderQuantity)
      expect(product.price).toBeGreaterThan(0)
      expect(product.sku.trim()).not.toBe('')
    }
  })

  it('keeps the ids the seeded sample orders reference', () => {
    const bySlug = new Map(catalogue.products.map((product) => [product.slug, product]))
    expect(bySlug.get('clear-cup-16oz')?.id).toBe('b1000000-0000-0000-0000-000000000001')
    expect(bySlug.get('bagasse-clamshell-9in')?.id).toBe('b1000000-0000-0000-0000-000000000005')
    expect(bySlug.get('thermal-label-50x30')?.id).toBe('b1000000-0000-0000-0000-000000000010')
    expect(bySlug.get('bioplastic-cutlery-set')?.id).toBe('b1000000-0000-0000-0000-000000000018')
    expect(bySlug.get('clear-cup-16oz')?.sortOrder).toBe(1)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/demo/catalogue.data.test.ts`
Expected: FAIL — `Failed to resolve import "./catalogue.data.json"`.

- [ ] **Step 4: Write the catalogue data**

Create `src/demo/catalogue.data.json`. The first eighteen products keep the ids, slugs, names, descriptions, prices, SKUs and stock they already have in `supabase/seed.sql`; eighteen are new. `sortOrder` runs 1–36 grouped by category so `/shop` browses category by category.

```json
{
  "categories": [
    {
      "id": "a1000000-0000-0000-0000-000000000001",
      "slug": "cups-lids",
      "name": "แก้วและฝา",
      "description": "แก้ว ฝา และอุปกรณ์สำหรับเครื่องดื่มเย็น",
      "imagePath": "/images/supplymate/cups-lids.png",
      "sortOrder": 1
    },
    {
      "id": "a1000000-0000-0000-0000-000000000002",
      "slug": "food-containers",
      "name": "กล่องอาหาร",
      "description": "กล่องและถ้วยสำหรับอาหารเดลิเวอรี",
      "imagePath": "/images/supplymate/food-containers.png",
      "sortOrder": 2
    },
    {
      "id": "a1000000-0000-0000-0000-000000000003",
      "slug": "paper-bags",
      "name": "ถุงกระดาษ",
      "description": "ถุงกระดาษสำหรับร้านอาหารและเบเกอรี",
      "imagePath": "/images/supplymate/paper-bags.png",
      "sortOrder": 3
    },
    {
      "id": "a1000000-0000-0000-0000-000000000004",
      "slug": "labels",
      "name": "ฉลากและสติกเกอร์",
      "description": "ฉลากม้วนและสติกเกอร์สำหรับงานหน้าร้าน",
      "imagePath": "/images/supplymate/labels.png",
      "sortOrder": 4
    },
    {
      "id": "a1000000-0000-0000-0000-000000000005",
      "slug": "bar-tools",
      "name": "อุปกรณ์บาร์",
      "description": "อุปกรณ์ชงและเสิร์ฟเครื่องดื่มสำหรับร้านค้า",
      "imagePath": "/images/supplymate/bar-tools.png",
      "sortOrder": 5
    },
    {
      "id": "a1000000-0000-0000-0000-000000000006",
      "slug": "eco-packaging",
      "name": "บรรจุภัณฑ์รักษ์โลก",
      "description": "บรรจุภัณฑ์ทางเลือกสำหรับลดพลาสติกใช้ครั้งเดียว",
      "imagePath": "/images/supplymate/eco-packaging.png",
      "sortOrder": 6
    }
  ],
  "products": [
    {
      "id": "b1000000-0000-0000-0000-000000000001",
      "categorySlug": "cups-lids",
      "slug": "clear-cup-16oz",
      "name": "แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม",
      "description": "แก้ว PET ใสพร้อมฝาโดมสำหรับกาแฟเย็นและเครื่องดื่มปั่น",
      "price": 1650,
      "sku": "SM-CUP-16-DOME",
      "stockQuantity": 42,
      "hasVariants": false,
      "sortOrder": 1,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "cup", "caption": "16 oz · PET", "options": { "topWidth": 190, "bottomWidth": 140, "height": 250, "lid": "dome", "texture": "clear" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000002",
      "categorySlug": "cups-lids",
      "slug": "pet-cup-22oz",
      "name": "แก้ว PET ใส 22 ออนซ์",
      "description": "แก้วใสทรงสูงสำหรับชาเย็นและเครื่องดื่มขนาดใหญ่",
      "price": 1780,
      "sku": "SM-CUP-22",
      "stockQuantity": 31,
      "hasVariants": false,
      "sortOrder": 2,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "cup", "caption": "22 oz · PET", "options": { "topWidth": 180, "bottomWidth": 120, "height": 300, "lid": "none", "texture": "clear" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000019",
      "categorySlug": "cups-lids",
      "slug": "hot-cup-8oz",
      "name": "แก้วกระดาษร้อน 8 ออนซ์",
      "description": "แก้วกระดาษเคลือบสำหรับกาแฟร้อนและชาร้อน",
      "price": 1240,
      "sku": "SM-CUP-H8",
      "stockQuantity": 47,
      "hasVariants": false,
      "sortOrder": 3,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "cup", "caption": "8 oz · paper", "options": { "topWidth": 160, "bottomWidth": 120, "height": 200, "lid": "flat", "texture": "paper" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000003",
      "categorySlug": "cups-lids",
      "slug": "black-flat-lid-95mm",
      "name": "ฝาเรียบสีดำ 95 มม.",
      "description": "ฝาปิดแก้วทรงเรียบพร้อมช่องเสียบหลอด",
      "price": 720,
      "sku": "SM-LID-95-BLK",
      "stockQuantity": 58,
      "hasVariants": false,
      "sortOrder": 4,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "lid", "caption": "Ø 95 mm · flat", "options": { "dome": false } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000020",
      "categorySlug": "cups-lids",
      "slug": "dome-lid-95mm",
      "name": "ฝาโดมใส 95 มม.",
      "description": "ฝาโดมใสสำหรับเครื่องดื่มปั่นและเมนูท็อปปิงสูง",
      "price": 780,
      "sku": "SM-LID-95-DOME",
      "stockQuantity": 51,
      "hasVariants": false,
      "sortOrder": 5,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "lid", "caption": "Ø 95 mm · dome", "options": { "dome": true } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000021",
      "categorySlug": "cups-lids",
      "slug": "cup-carrier-4",
      "name": "ถาดหิ้วแก้ว 4 ช่อง",
      "description": "ถาดกระดาษหิ้วแก้ว 4 ช่องสำหรับงานเดลิเวอรี",
      "price": 960,
      "sku": "SM-CUP-CARRIER-4",
      "stockQuantity": 23,
      "hasVariants": false,
      "sortOrder": 6,
      "packageUnit": "pack",
      "unitsPerPackage": 200,
      "minOrderQuantity": 2,
      "art": { "shape": "carrier", "caption": "4 cups" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000004",
      "categorySlug": "food-containers",
      "slug": "kraft-noodle-box",
      "name": "กล่องคราฟท์ใส่อาหารทรงสูง",
      "description": "กล่องเคลือบกันซึมสำหรับข้าวและเส้น มีสองขนาดให้เลือก",
      "price": 890,
      "sku": "SM-BOX-NOODLE",
      "stockQuantity": 26,
      "hasVariants": true,
      "sortOrder": 7,
      "packageUnit": "carton",
      "unitsPerPackage": 300,
      "minOrderQuantity": 1,
      "art": { "shape": "box", "caption": "750 / 1,000 ml", "options": { "style": "noodle" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000005",
      "categorySlug": "food-containers",
      "slug": "bagasse-clamshell-9in",
      "name": "กล่องชานอ้อย 9 นิ้ว",
      "description": "กล่องฝาพับจากเยื่อชานอ้อยสำหรับอาหารจานเดียว",
      "price": 980,
      "sku": "SM-BOX-BAGASSE-9",
      "stockQuantity": 24,
      "hasVariants": false,
      "sortOrder": 8,
      "packageUnit": "carton",
      "unitsPerPackage": 200,
      "minOrderQuantity": 1,
      "art": { "shape": "box", "caption": "9 in · clamshell", "options": { "style": "clamshell" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000022",
      "categorySlug": "food-containers",
      "slug": "pp-microwave-bowl-750",
      "name": "ถ้วยพลาสติก PP เข้าไมโครเวฟ 750 มล.",
      "description": "ถ้วย PP ฝาล็อกแน่น เข้าไมโครเวฟได้",
      "price": 1180,
      "sku": "SM-BOWL-PP-750",
      "stockQuantity": 28,
      "hasVariants": false,
      "sortOrder": 9,
      "packageUnit": "carton",
      "unitsPerPackage": 300,
      "minOrderQuantity": 1,
      "art": { "shape": "bowl", "caption": "750 ml", "options": { "lid": true, "texture": "clear" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000023",
      "categorySlug": "food-containers",
      "slug": "rice-tray-2-compartment",
      "name": "ถาดอาหาร 2 ช่องพร้อมฝา",
      "description": "ถาดอาหาร 2 ช่องพร้อมฝาสำหรับข้าวกล่อง",
      "price": 1420,
      "sku": "SM-TRAY-2C",
      "stockQuantity": 21,
      "hasVariants": false,
      "sortOrder": 10,
      "packageUnit": "carton",
      "unitsPerPackage": 300,
      "minOrderQuantity": 1,
      "art": { "shape": "box", "caption": "2 compartments", "options": { "style": "tray" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000024",
      "categorySlug": "food-containers",
      "slug": "soup-cup-16oz",
      "name": "ถ้วยซุปกระดาษ 16 ออนซ์พร้อมฝา",
      "description": "ถ้วยกระดาษทรงสูงพร้อมฝาสำหรับซุปและโจ๊ก",
      "price": 1090,
      "sku": "SM-CUP-SOUP-16",
      "stockQuantity": 30,
      "hasVariants": false,
      "sortOrder": 11,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "cup", "caption": "16 oz · soup", "options": { "topWidth": 170, "bottomWidth": 140, "height": 220, "lid": "flat", "texture": "paper" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000006",
      "categorySlug": "food-containers",
      "slug": "sauce-cup-2oz",
      "name": "ถ้วยน้ำจิ้ม 2 ออนซ์พร้อมฝา",
      "description": "ถ้วยใสขนาดเล็กพร้อมฝาปิดแน่นสำหรับซอสและท็อปปิง",
      "price": 1320,
      "sku": "SM-CUP-SAUCE-2",
      "stockQuantity": 37,
      "hasVariants": false,
      "sortOrder": 12,
      "packageUnit": "carton",
      "unitsPerPackage": 2000,
      "minOrderQuantity": 1,
      "art": { "shape": "cup", "caption": "2 oz", "options": { "topWidth": 130, "bottomWidth": 96, "height": 120, "lid": "flat", "texture": "clear" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000007",
      "categorySlug": "paper-bags",
      "slug": "kraft-bag-small",
      "name": "ถุงกระดาษคราฟท์หูหิ้ว ขนาด S",
      "description": "ถุงทรงตั้งสำหรับขนมและสินค้าเบา",
      "price": 1150,
      "sku": "SM-BAG-KRAFT-S",
      "stockQuantity": 19,
      "hasVariants": false,
      "sortOrder": 13,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "size S", "options": { "handle": true, "width": 180, "height": 220 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000008",
      "categorySlug": "paper-bags",
      "slug": "kraft-bag-medium",
      "name": "ถุงกระดาษคราฟท์หูหิ้ว ขนาด M",
      "description": "ถุงทรงตั้งสำหรับกล่องอาหารและชุดของฝาก",
      "price": 1390,
      "sku": "SM-BAG-KRAFT-M",
      "stockQuantity": 22,
      "hasVariants": false,
      "sortOrder": 14,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "size M", "options": { "handle": true, "width": 220, "height": 270 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000025",
      "categorySlug": "paper-bags",
      "slug": "kraft-bag-large",
      "name": "ถุงกระดาษคราฟท์หูหิ้ว ขนาด L",
      "description": "ถุงทรงตั้งขนาดใหญ่สำหรับชุดอาหารหลายกล่อง",
      "price": 1620,
      "sku": "SM-BAG-KRAFT-L",
      "stockQuantity": 17,
      "hasVariants": false,
      "sortOrder": 15,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "size L", "options": { "handle": true, "width": 258, "height": 310 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000009",
      "categorySlug": "paper-bags",
      "slug": "greaseproof-snack-bag",
      "name": "ถุงกระดาษกันมันสำหรับของทอด",
      "description": "ถุงเปิดปากสำหรับเฟรนช์ฟรายส์และของว่าง",
      "price": 760,
      "sku": "SM-BAG-GREASE",
      "stockQuantity": 35,
      "hasVariants": false,
      "sortOrder": 16,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "greaseproof", "options": { "handle": false, "open": true, "width": 170, "height": 230 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000026",
      "categorySlug": "paper-bags",
      "slug": "bakery-window-bag",
      "name": "ถุงกระดาษหน้าต่างใสสำหรับเบเกอรี",
      "description": "ถุงกระดาษมีหน้าต่างใสสำหรับขนมอบและเบเกอรี",
      "price": 880,
      "sku": "SM-BAG-WINDOW",
      "stockQuantity": 26,
      "hasVariants": false,
      "sortOrder": 17,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "window", "options": { "handle": false, "window": true, "width": 190, "height": 250 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000027",
      "categorySlug": "paper-bags",
      "slug": "delivery-flat-bag",
      "name": "ถุงกระดาษก้นแบนสำหรับเดลิเวอรี",
      "description": "ถุงกระดาษก้นแบนวางตั้งได้สำหรับงานส่งอาหาร",
      "price": 1040,
      "sku": "SM-BAG-FLAT",
      "stockQuantity": 24,
      "hasVariants": false,
      "sortOrder": 18,
      "packageUnit": "carton",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "bag", "caption": "flat base", "options": { "handle": true, "flatBase": true, "width": 232, "height": 250 } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000010",
      "categorySlug": "labels",
      "slug": "thermal-label-50x30",
      "name": "ฉลากความร้อน 50 × 30 มม.",
      "description": "ฉลากเปล่าสำหรับพิมพ์ราคาและวันที่ผลิต",
      "price": 95,
      "sku": "SM-LABEL-5030",
      "stockQuantity": 120,
      "hasVariants": false,
      "sortOrder": 19,
      "packageUnit": "roll",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 6,
      "art": { "shape": "roll", "caption": "50 × 30 mm", "options": { "width": 230, "label": "wide" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000028",
      "categorySlug": "labels",
      "slug": "thermal-label-40x25",
      "name": "ฉลากความร้อน 40 × 25 มม.",
      "description": "ฉลากความร้อนขนาดเล็กสำหรับติดแก้วและถ้วย",
      "price": 82,
      "sku": "SM-LABEL-4025",
      "stockQuantity": 140,
      "hasVariants": false,
      "sortOrder": 20,
      "packageUnit": "roll",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 6,
      "art": { "shape": "roll", "caption": "40 × 25 mm", "options": { "width": 190, "label": "wide" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000011",
      "categorySlug": "labels",
      "slug": "blank-sticker-roll-40mm",
      "name": "สติกเกอร์เปล่าทรงกลม 40 มม.",
      "description": "สติกเกอร์กระดาษขาวสำหรับปิดถุงและติดแก้ว",
      "price": 120,
      "sku": "SM-STICKER-40",
      "stockQuantity": 86,
      "hasVariants": false,
      "sortOrder": 21,
      "packageUnit": "roll",
      "unitsPerPackage": 500,
      "minOrderQuantity": 4,
      "art": { "shape": "roll", "caption": "Ø 40 mm", "options": { "width": 210, "label": "round" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000029",
      "categorySlug": "labels",
      "slug": "fragile-sticker-roll",
      "name": "สติกเกอร์ระวังแตก",
      "description": "สติกเกอร์เตือนสำหรับพัสดุและกล่องที่ต้องระวัง",
      "price": 145,
      "sku": "SM-STICKER-FRAGILE",
      "stockQuantity": 72,
      "hasVariants": false,
      "sortOrder": 22,
      "packageUnit": "roll",
      "unitsPerPackage": 500,
      "minOrderQuantity": 3,
      "art": { "shape": "roll", "caption": "fragile", "options": { "width": 200, "label": "round" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000012",
      "categorySlug": "labels",
      "slug": "date-label-pack",
      "name": "สติกเกอร์ระบุวันผลิตแบบเขียน",
      "description": "สติกเกอร์สำหรับจัดการวัตถุดิบและวันหมดอายุ",
      "price": 180,
      "sku": "SM-LABEL-DATE",
      "stockQuantity": 64,
      "hasVariants": false,
      "sortOrder": 23,
      "packageUnit": "pack",
      "unitsPerPackage": 500,
      "minOrderQuantity": 2,
      "art": { "shape": "sheet", "caption": "date labels" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000030",
      "categorySlug": "labels",
      "slug": "receipt-roll-58mm",
      "name": "กระดาษใบเสร็จ 58 มม.",
      "description": "กระดาษความร้อนสำหรับเครื่องพิมพ์ใบเสร็จหน้าร้าน",
      "price": 210,
      "sku": "SM-ROLL-RECEIPT-58",
      "stockQuantity": 95,
      "hasVariants": false,
      "sortOrder": 24,
      "packageUnit": "pack",
      "unitsPerPackage": 10,
      "minOrderQuantity": 2,
      "art": { "shape": "roll", "caption": "58 mm", "options": { "width": 150, "label": "tape" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000013",
      "categorySlug": "bar-tools",
      "slug": "stainless-bar-spoon",
      "name": "ช้อนบาร์สเตนเลสด้ามเกลียว",
      "description": "ช้อนด้ามยาวสำหรับคนเครื่องดื่มและตวงชั้น",
      "price": 540,
      "sku": "SM-BAR-SPOON",
      "stockQuantity": 18,
      "hasVariants": false,
      "sortOrder": 25,
      "packageUnit": "pack",
      "unitsPerPackage": 12,
      "minOrderQuantity": 1,
      "art": { "shape": "tool", "caption": "30 cm", "options": { "head": "spoon", "twist": true } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000031",
      "categorySlug": "bar-tools",
      "slug": "ice-scoop-stainless",
      "name": "ที่ตักน้ำแข็งสเตนเลส",
      "description": "ที่ตักน้ำแข็งสเตนเลสสำหรับงานบาร์และหน้าร้าน",
      "price": 620,
      "sku": "SM-BAR-SCOOP",
      "stockQuantity": 26,
      "hasVariants": false,
      "sortOrder": 26,
      "packageUnit": "pack",
      "unitsPerPackage": 12,
      "minOrderQuantity": 1,
      "art": { "shape": "tool", "caption": "8 oz", "options": { "head": "scoop", "twist": false } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000014",
      "categorySlug": "bar-tools",
      "slug": "cocktail-shaker",
      "name": "เชคเกอร์สเตนเลส",
      "description": "เชคเกอร์สามชิ้นสำหรับบาร์กาแฟและเครื่องดื่ม มีสองขนาด",
      "price": 2160,
      "sku": "SM-BAR-SHAKER",
      "stockQuantity": 15,
      "hasVariants": true,
      "sortOrder": 27,
      "packageUnit": "case",
      "unitsPerPackage": 24,
      "minOrderQuantity": 1,
      "art": { "shape": "shaker", "caption": "500 / 750 ml" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000032",
      "categorySlug": "bar-tools",
      "slug": "milk-pitcher-600ml",
      "name": "เหยือกตีฟองนม 600 มล.",
      "description": "เหยือกสเตนเลสสำหรับตีฟองนมและเทลาย",
      "price": 1180,
      "sku": "SM-BAR-PITCHER-600",
      "stockQuantity": 20,
      "hasVariants": false,
      "sortOrder": 28,
      "packageUnit": "pack",
      "unitsPerPackage": 12,
      "minOrderQuantity": 1,
      "art": { "shape": "pitcher", "caption": "600 ml" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000015",
      "categorySlug": "bar-tools",
      "slug": "syrup-pump-pack",
      "name": "หัวปั๊มไซรัปมาตรฐาน",
      "description": "หัวปั๊มปริมาณคงที่สำหรับขวดไซรัปร้านกาแฟ",
      "price": 390,
      "sku": "SM-BAR-PUMP",
      "stockQuantity": 43,
      "hasVariants": false,
      "sortOrder": 29,
      "packageUnit": "pack",
      "unitsPerPackage": 6,
      "minOrderQuantity": 1,
      "art": { "shape": "pump", "caption": "10 ml / press" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000033",
      "categorySlug": "bar-tools",
      "slug": "muddler-wood",
      "name": "ไม้บดสมุนไพรด้ามไม้",
      "description": "ไม้บดสมุนไพรและผลไม้สำหรับเครื่องดื่มสด",
      "price": 480,
      "sku": "SM-BAR-MUDDLER",
      "stockQuantity": 22,
      "hasVariants": false,
      "sortOrder": 30,
      "packageUnit": "pack",
      "unitsPerPackage": 12,
      "minOrderQuantity": 1,
      "art": { "shape": "stick", "caption": "20 cm", "options": { "tip": "flat" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000016",
      "categorySlug": "eco-packaging",
      "slug": "bagasse-plate-9in",
      "name": "จานชานอ้อย 9 นิ้ว",
      "description": "จานเยื่อธรรมชาติสำหรับอาหารจัดเลี้ยงและงานอีเวนต์",
      "price": 1250,
      "sku": "SM-ECO-PLATE-9",
      "stockQuantity": 29,
      "hasVariants": false,
      "sortOrder": 31,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "plate", "caption": "9 in" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000034",
      "categorySlug": "eco-packaging",
      "slug": "kraft-soup-bowl-500",
      "name": "ชามกระดาษคราฟท์ 500 มล.",
      "description": "ชามกระดาษคราฟท์พร้อมฝาสำหรับซุปและอาหารร้อน",
      "price": 1120,
      "sku": "SM-ECO-BOWL-500",
      "stockQuantity": 25,
      "hasVariants": false,
      "sortOrder": 32,
      "packageUnit": "carton",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "bowl", "caption": "500 ml", "options": { "lid": true, "texture": "kraft" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000017",
      "categorySlug": "eco-packaging",
      "slug": "compostable-straw",
      "name": "หลอดย่อยสลายได้",
      "description": "หลอดจากวัสดุย่อยสลายได้ มีขนาดมาตรฐานและขนาดชานม",
      "price": 980,
      "sku": "SM-ECO-STRAW",
      "stockQuantity": 33,
      "hasVariants": true,
      "sortOrder": 33,
      "packageUnit": "case",
      "unitsPerPackage": 1000,
      "minOrderQuantity": 1,
      "art": { "shape": "straws", "caption": "6 / 12 mm" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000035",
      "categorySlug": "eco-packaging",
      "slug": "wooden-stirrer",
      "name": "ไม้คนกาแฟ",
      "description": "ไม้คนเครื่องดื่มแบบใช้ครั้งเดียว ย่อยสลายได้",
      "price": 340,
      "sku": "SM-ECO-STIRRER",
      "stockQuantity": 40,
      "hasVariants": false,
      "sortOrder": 34,
      "packageUnit": "case",
      "unitsPerPackage": 2000,
      "minOrderQuantity": 1,
      "art": { "shape": "stick", "caption": "14 cm", "options": { "tip": "round" } }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000018",
      "categorySlug": "eco-packaging",
      "slug": "bioplastic-cutlery-set",
      "name": "ชุดช้อนส้อมไบโอพลาสติก",
      "description": "ชุดช้อนส้อมบรรจุแยกสำหรับอาหารเดลิเวอรี",
      "price": 1480,
      "sku": "SM-ECO-CUTLERY",
      "stockQuantity": 27,
      "hasVariants": false,
      "sortOrder": 35,
      "packageUnit": "case",
      "unitsPerPackage": 500,
      "minOrderQuantity": 1,
      "art": { "shape": "cutlery", "caption": "fork · spoon" }
    },
    {
      "id": "b1000000-0000-0000-0000-000000000036",
      "categorySlug": "eco-packaging",
      "slug": "paper-lunch-box-eco",
      "name": "กล่องกระดาษคราฟท์รักษ์โลก 1 ช่อง",
      "description": "กล่องกระดาษคราฟท์หนึ่งช่องสำหรับข้าวกล่องรักษ์โลก",
      "price": 1310,
      "sku": "SM-ECO-LUNCH",
      "stockQuantity": 23,
      "hasVariants": false,
      "sortOrder": 36,
      "packageUnit": "carton",
      "unitsPerPackage": 300,
      "minOrderQuantity": 1,
      "art": { "shape": "box", "caption": "1 compartment", "options": { "style": "lunch" } }
    }
  ]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/demo/catalogue.data.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 (this proves `resolveJsonModule` is wired correctly).

- [ ] **Step 7: Commit**

```bash
git add src/demo/catalogue.data.json src/demo/catalogue.data.test.ts tsconfig.app.json && git commit -m "feat: add the 36-product catalogue dataset"
```

---

### Task 2: Product art generator

Turns each product's `art` spec into a self-contained SVG. Still no consumer — the showcase keeps using photos until Task 3 — so every existing test stays green.

**Files:**
- Create: `scripts/productArt.mjs`
- Create: `scripts/productArt.test.mjs`
- Create: `scripts/generate-product-art.mjs`
- Create: `public/images/supplymate/products/*.svg` (generated, 36 files)
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/demo/catalogue.data.json` (`products[].slug`, `products[].name`, `products[].art`).
- Produces:
  - `scripts/productArt.mjs` exports `renderProductArt({ shape, caption, label, options })` returning an SVG string, and `SHAPES` (a `Record<string, (options) => string[]>`).
  - `scripts/generate-product-art.mjs`, runnable as `node scripts/generate-product-art.mjs` (writes) or `--check` (exits 1 on drift).
  - Files at `public/images/supplymate/products/{slug}.svg`.

- [ ] **Step 1: Write the failing renderer test**

Create `scripts/productArt.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { SHAPES, renderProductArt } from './productArt.mjs'

const render = (shape) =>
  renderProductArt({ shape, caption: '10 oz', label: 'ตัวอย่างสินค้า', options: {} })

describe('renderProductArt', () => {
  it('renders one self-contained SVG root at a square viewBox', () => {
    const svg = render('cup')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg.match(/<svg/g)).toHaveLength(1)
    expect(svg).toContain('viewBox="0 0 640 640"')
  })

  it('never reaches outside the file', () => {
    for (const shape of Object.keys(SHAPES)) {
      const svg = render(shape)
      expect(svg).not.toContain('http://www.w3.org/1999/xlink')
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
      expect(svg).not.toContain('<image')
      expect(svg).not.toContain('@import')
    }
  })

  it('labels the drawing for assistive technology and prints the caption', () => {
    const svg = renderProductArt({
      shape: 'bag',
      caption: 'size M',
      label: 'ถุงกระดาษ & ฝา',
      options: { handle: true },
    })
    expect(svg).toContain('aria-label="ถุงกระดาษ &amp; ฝา"')
    expect(svg).toContain('>size M<')
  })

  it('draws something for every shape in the vocabulary', () => {
    for (const shape of Object.keys(SHAPES)) {
      expect(SHAPES[shape]({}).join('').length).toBeGreaterThan(40)
    }
  })

  it('rejects an unknown shape rather than emitting an empty drawing', () => {
    expect(() => render('teapot')).toThrow(/teapot/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/productArt.test.mjs`
Expected: FAIL — cannot resolve `./productArt.mjs`.

- [ ] **Step 3: Write the renderer**

Create `scripts/productArt.mjs`:

```js
// Per-product catalogue art. Line drawings, not photography: the showcase
// ships one owned illustration per product instead of repeating six stock
// photos across thirty-six cards. Everything is inlined -- these load through
// <img>, so they cannot reach a webfont, a stylesheet, or the page's tokens.
// The palette below therefore repeats the Ledger neutrals as literal hex.
export const PAPER = '#f1f1f5'
export const INK = '#2b2d3c'
export const HAIRLINE = '#c9c9d3'
export const CAPTION = '#5c5d6c'
export const ACCENT = '#4a63c8'

const CX = 320
const BASE = 470
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

const n = (value) => Math.round(value * 10) / 10

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const draw = (d, extra = '') => `    <path d="${d}"${extra ? ` ${extra}` : ''}/>`
const oval = (cx, cy, rx, ry, extra = '') =>
  `    <ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${extra ? ` ${extra}` : ''}/>`
const seg = (x1, y1, x2, y2, extra = '') => draw(`M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`, extra)
const soft = `stroke="${HAIRLINE}" stroke-width="5"`
const mark = `stroke="${ACCENT}" stroke-width="7"`
const box = (x, y, w, h, r, extra = '') =>
  `    <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}"${extra ? ` ${extra}` : ''}/>`

function cup({ topWidth = 180, bottomWidth = 130, height = 250, lid = 'none', texture = 'clear' }) {
  const top = BASE - height
  const halfTop = topWidth / 2
  const halfBottom = bottomWidth / 2
  const halfAt = (t) => (topWidth + (bottomWidth - topWidth) * t) / 2
  const parts = [
    draw(
      `M ${n(CX - halfTop)} ${top} L ${n(CX - halfBottom)} ${BASE - 14}` +
        ` Q ${n(CX - halfBottom)} ${BASE} ${n(CX - halfBottom + 14)} ${BASE}` +
        ` L ${n(CX + halfBottom - 14)} ${BASE}` +
        ` Q ${n(CX + halfBottom)} ${BASE} ${n(CX + halfBottom)} ${BASE - 14}` +
        ` L ${n(CX + halfTop)} ${top}`,
    ),
    oval(CX, top, halfTop, 16),
  ]

  if (texture === 'paper') {
    for (const t of [0.34, 0.46]) {
      const y = top + height * t
      parts.push(seg(CX - halfAt(t) + 10, y, CX + halfAt(t) - 10, y, soft))
    }
  } else {
    parts.push(seg(CX - halfTop + 28, top + 38, CX - halfAt(0.72) + 24, top + height * 0.72, soft))
  }

  if (lid === 'flat') {
    parts.push(
      draw(
        `M ${n(CX - halfTop - 14)} ${top - 4} L ${n(CX - halfTop - 14)} ${top - 30}` +
          ` L ${n(CX + halfTop + 14)} ${top - 30} L ${n(CX + halfTop + 14)} ${top - 4}`,
      ),
      oval(CX, top - 30, halfTop + 14, 15),
      seg(CX - 18, top - 34, CX + 18, top - 34, mark),
    )
  }

  if (lid === 'dome') {
    parts.push(
      draw(
        `M ${n(CX - halfTop - 14)} ${top - 4}` +
          ` A ${n(halfTop + 14)} ${n(halfTop * 0.82)} 0 0 1 ${n(CX + halfTop + 14)} ${top - 4}`,
      ),
      oval(CX, top - 4, halfTop + 14, 15),
      seg(CX, top - halfTop * 0.72, CX, top - halfTop * 0.72 + 36, mark),
    )
  }

  return parts
}

function lid({ dome = false }) {
  const cy = BASE - 62
  const rx = 150
  const parts = [
    oval(CX, cy, rx, 52),
    draw(`M ${CX - rx} ${cy} L ${CX - rx} ${cy + 32} Q ${CX} ${cy + 80} ${CX + rx} ${cy + 32} L ${CX + rx} ${cy}`),
  ]

  if (dome) {
    parts.push(
      draw(`M ${n(CX - rx + 12)} ${cy - 10} A ${n(rx - 12)} 116 0 0 1 ${n(CX + rx - 12)} ${cy - 10}`),
      seg(CX, cy - 120, CX, cy - 86, mark),
    )
  } else {
    parts.push(oval(CX, cy, rx - 36, 36, soft), seg(CX - 24, cy - 4, CX + 24, cy - 4, mark))
  }

  return parts
}

function carrier() {
  const left = CX - 168
  const right = CX + 168
  const top = BASE - 128
  return [
    draw(`M ${left} ${top} L ${n(left + 26)} ${BASE} L ${n(right - 26)} ${BASE} L ${right} ${top} Z`),
    seg(left, top, right, top),
    draw(`M ${CX - 94} ${top} A 94 98 0 0 1 ${CX + 94} ${top}`),
    ...[-106, -36, 36, 106].map((dx) => oval(CX + dx, top + 26, 30, 13, soft)),
  ]
}

function bowl({ lid: hasLid = true, texture = 'clear' }) {
  const rim = BASE - 150
  const parts = [
    draw(`M ${CX - 150} ${rim} Q ${CX - 128} ${BASE} ${CX} ${BASE} Q ${CX + 128} ${BASE} ${CX + 150} ${rim}`),
    oval(CX, rim, 150, 28),
  ]

  if (hasLid) {
    parts.push(
      oval(CX, rim - 42, 158, 30),
      seg(CX - 158, rim - 42, CX - 158, rim - 22),
      seg(CX + 158, rim - 42, CX + 158, rim - 22),
      seg(CX - 26, rim - 58, CX + 26, rim - 58, mark),
    )
  }

  parts.push(
    texture === 'kraft'
      ? draw(`M ${CX - 110} ${rim + 60} Q ${CX} ${rim + 82} ${CX + 110} ${rim + 60}`, soft)
      : seg(CX - 108, rim + 44, CX - 92, rim + 96, soft),
  )

  return parts
}

function bag({ handle = true, width = 200, height = 250, window: hasWindow = false, open = false, flatBase = false }) {
  const half = width / 2
  const top = BASE - height
  const parts = [
    draw(`M ${n(CX - half)} ${top} L ${n(CX - half)} ${BASE} L ${n(CX + half)} ${BASE} L ${n(CX + half)} ${top} Z`),
    seg(CX + half - 34, top, CX + half - 34, BASE, soft),
  ]

  parts.push(
    open
      ? draw(
          `M ${n(CX - half)} ${top} L ${n(CX - half / 2)} ${top - 18}` +
            ` L ${CX} ${top} L ${n(CX + half / 2)} ${top - 18} L ${n(CX + half)} ${top}`,
        )
      : seg(CX - half, top + 30, CX + half, top + 30, soft),
  )

  if (handle) {
    parts.push(
      draw(`M ${n(CX - half / 2)} ${top + 6} A ${n(half / 2)} ${n(half / 2 + 10)} 0 0 1 ${n(CX + half / 2)} ${top + 6}`),
    )
  }

  if (hasWindow) {
    parts.push(box(CX - half + 40, top + 62, width - 114, height - 132, 12, soft))
  }

  if (flatBase) {
    parts.push(seg(CX - half + 12, BASE - 26, CX + half - 46, BASE - 26, soft))
  }

  return parts
}

function roll({ width = 210, label = 'wide' }) {
  const half = width / 2
  const top = BASE - 210
  const parts = [
    draw(`M ${n(CX - half)} ${top} L ${n(CX - half)} ${BASE - 60} L ${n(CX + half)} ${BASE - 60} L ${n(CX + half)} ${top}`),
    oval(CX, top, half, 46),
    oval(CX, BASE - 60, half, 46),
    oval(CX, top, half / 2.6, 18, soft),
  ]

  if (label === 'wide') {
    parts.push(
      draw(`M ${n(CX + half)} ${BASE - 108} L ${n(CX + half + 96)} ${BASE - 74} L ${n(CX + half + 96)} ${BASE - 6} L ${n(CX + half)} ${BASE - 40} Z`),
      seg(CX + half + 18, BASE - 74, CX + half + 82, BASE - 52, mark),
    )
  } else if (label === 'round') {
    parts.push(
      draw(`M ${n(CX + half)} ${BASE - 108} L ${n(CX + half + 96)} ${BASE - 74} L ${n(CX + half + 96)} ${BASE - 6} L ${n(CX + half)} ${BASE - 40} Z`),
      oval(CX + half + 48, BASE - 56, 22, 20, mark),
    )
  } else {
    parts.push(draw(`M ${n(CX + half)} ${BASE - 96} L ${n(CX + half + 72)} ${BASE - 62} L ${n(CX + half + 72)} ${BASE - 26} L ${n(CX + half)} ${BASE - 60}`, soft))
  }

  return parts
}

function sheet() {
  const left = CX - 150
  const top = BASE - 300
  const parts = [box(left, top, 300, 300, 14)]
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      parts.push(box(left + 28 + column * 132, top + 30 + row * 90, 116, 62, 10, soft))
    }
  }
  parts.push(seg(left + 44, top + 60, left + 128, top + 60, mark))
  return parts
}

function tool({ head = 'spoon', twist = false }) {
  const topX = CX - 74
  const topY = BASE - 320
  const tipX = CX + 42
  const tipY = BASE - 70
  const parts = [seg(topX, topY, tipX, tipY)]

  parts.push(
    head === 'scoop'
      ? draw(`M ${n(tipX - 34)} ${tipY - 6} Q ${n(tipX + 6)} ${BASE + 4} ${n(tipX + 62)} ${tipY + 6} L ${n(tipX + 26)} ${tipY - 30} Z`)
      : oval(tipX + 22, tipY + 26, 40, 26),
  )

  if (twist) {
    for (let step = 0; step < 6; step += 1) {
      const t = 0.18 + step * 0.11
      parts.push(
        seg(topX + (tipX - topX) * t - 12, topY + (tipY - topY) * t + 6, topX + (tipX - topX) * t + 12, topY + (tipY - topY) * t - 6, soft),
      )
    }
  } else {
    parts.push(oval(topX + 4, topY + 10, 20, 12, soft))
  }

  return parts
}

function shaker() {
  const top = BASE - 330
  return [
    draw(`M ${CX - 62} ${top + 60} L ${CX - 96} ${BASE} L ${CX + 96} ${BASE} L ${CX + 62} ${top + 60} Z`),
    seg(CX - 62, top + 60, CX + 62, top + 60),
    draw(`M ${CX - 58} ${top + 60} L ${CX - 58} ${top + 24} L ${CX + 58} ${top + 24} L ${CX + 58} ${top + 60}`),
    seg(CX - 58, top + 24, CX + 58, top + 24),
    draw(`M ${CX - 34} ${top + 24} L ${CX - 34} ${top} L ${CX + 34} ${top} L ${CX + 34} ${top + 24}`),
    oval(CX, top, 34, 12),
    seg(CX - 96, BASE - 74, CX + 96, BASE - 74, soft),
  ]
}

function pitcher() {
  const top = BASE - 260
  return [
    draw(`M ${CX - 86} ${top} L ${CX - 108} ${BASE} L ${CX + 68} ${BASE} L ${CX + 48} ${top} Z`),
    oval(CX - 19, top, 67, 20),
    draw(`M ${CX + 48} ${top + 6} L ${CX + 104} ${top - 20} L ${CX + 60} ${top + 40}`),
    draw(`M ${CX + 62} ${top + 78} Q ${CX + 132} ${top + 116} ${CX + 74} ${top + 176}`),
    seg(CX - 78, top + 92, CX + 46, top + 92, soft),
  ]
}

function pump() {
  const top = BASE - 210
  return [
    box(CX - 84, top, 168, 210, 18),
    seg(CX - 84, top + 54, CX + 84, top + 54, soft),
    draw(`M ${CX - 26} ${top} L ${CX - 26} ${top - 52} L ${CX + 26} ${top - 52} L ${CX + 26} ${top}`),
    draw(`M ${CX - 26} ${top - 52} L ${CX - 86} ${top - 74} L ${CX - 86} ${top - 96}`),
    seg(CX + 26, top - 96, CX + 86, top - 96, mark),
    seg(CX, top + 20, CX, top + 186, soft),
  ]
}

function stick({ tip = 'round' }) {
  const parts = [
    draw(`M ${CX - 66} ${BASE - 300} L ${CX + 14} ${BASE - 40}`, `stroke-width="22"`),
    draw(`M ${CX + 40} ${BASE - 286} L ${CX + 104} ${BASE - 56}`, `${soft} stroke-width="16"`),
  ]

  parts.push(
    tip === 'flat'
      ? draw(`M ${CX - 4} ${BASE - 86} L ${CX + 44} ${BASE - 72} L ${CX + 32} ${BASE - 26} L ${CX - 18} ${BASE - 40} Z`)
      : oval(CX + 14, BASE - 40, 20, 20),
  )

  return parts
}

function plate() {
  return [
    oval(CX, BASE - 150, 210, 76),
    oval(CX, BASE - 150, 152, 52, soft),
    draw(`M ${CX - 210} ${BASE - 148} Q ${CX} ${BASE - 44} ${CX + 210} ${BASE - 148}`),
    draw(`M ${CX - 186} ${BASE - 66} Q ${CX} ${BASE + 6} ${CX + 186} ${BASE - 66}`, soft),
  ]
}

function straws() {
  return [
    draw(`M ${CX - 122} ${BASE} L ${CX - 66} ${BASE - 310}`, `stroke-width="20"`),
    draw(`M ${CX - 18} ${BASE} L ${CX + 24} ${BASE - 310}`, `stroke-width="26"`),
    draw(`M ${CX + 86} ${BASE} L ${CX + 118} ${BASE - 234} L ${CX + 178} ${BASE - 280}`, `stroke-width="20"`),
    seg(CX - 78, BASE - 244, CX - 58, BASE - 246, mark),
  ]
}

function cutlery() {
  const top = BASE - 320
  return [
    box(CX - 132, top, 264, 320, 20),
    seg(CX - 132, top + 46, CX + 132, top + 46, soft),
    draw(`M ${CX - 62} ${BASE - 60} L ${CX - 62} ${top + 150}`, `stroke-width="12"`),
    draw(`M ${CX - 90} ${top + 92} L ${CX - 90} ${top + 150} L ${CX - 34} ${top + 150} L ${CX - 34} ${top + 92}`),
    seg(CX - 62, top + 92, CX - 62, top + 150, soft),
    draw(`M ${CX + 62} ${BASE - 60} L ${CX + 62} ${top + 148}`, `stroke-width="12"`),
    oval(CX + 62, top + 116, 32, 40),
  ]
}

export const SHAPES = {
  cup,
  lid,
  carrier,
  bowl,
  bag,
  roll,
  sheet,
  tool,
  shaker,
  pitcher,
  pump,
  stick,
  plate,
  straws,
  cutlery,
  box: boxShape,
}

function boxShape({ style = 'lunch' }) {
  if (style === 'noodle') {
    const top = BASE - 250
    return [
      draw(`M ${CX - 122} ${top} L ${CX - 88} ${BASE} L ${CX + 88} ${BASE} L ${CX + 122} ${top} Z`),
      seg(CX - 122, top, CX + 122, top),
      draw(`M ${CX - 66} ${top - 4} A 66 74 0 0 1 ${CX + 66} ${top - 4}`, mark),
      seg(CX - 88, BASE - 72, CX + 88, BASE - 72, soft),
    ]
  }

  if (style === 'clamshell') {
    return [
      box(CX - 176, BASE - 78, 352, 78, 12),
      box(CX - 176, BASE - 154, 352, 76, 12),
      oval(CX - 176, BASE - 116, 12, 12, soft),
      seg(CX + 152, BASE - 100, CX + 200, BASE - 100, mark),
    ]
  }

  if (style === 'tray') {
    return [
      box(CX - 186, BASE - 110, 372, 110, 14),
      seg(CX, BASE - 110, CX, BASE, soft),
      draw(`M ${CX - 196} ${BASE - 142} L ${CX - 196} ${BASE - 176} L ${CX + 196} ${BASE - 176} L ${CX + 196} ${BASE - 142}`),
      seg(CX - 196, BASE - 142, CX + 196, BASE - 142),
      seg(CX - 30, BASE - 196, CX + 30, BASE - 196, mark),
    ]
  }

  return [
    box(CX - 168, BASE - 168, 336, 168, 14),
    draw(`M ${CX - 182} ${BASE - 168} L ${CX - 182} ${BASE - 214} L ${CX + 182} ${BASE - 214} L ${CX + 182} ${BASE - 168}`),
    seg(CX - 182, BASE - 168, CX + 182, BASE - 168),
    seg(CX - 168, BASE - 74, CX + 168, BASE - 74, soft),
    seg(CX - 34, BASE - 236, CX + 34, BASE - 236, mark),
  ]
}

export function renderProductArt({ shape, caption, label, options = {} }) {
  const drawShape = SHAPES[shape]
  if (!drawShape) {
    throw new Error(`Unknown catalogue art shape: ${shape}`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${escapeXml(label)}">
  <rect width="640" height="640" fill="${PAPER}"/>
  <path d="M 120 478 L 520 478" stroke="${HAIRLINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
  <g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
${drawShape(options).join('\n')}
  </g>
  <text x="320" y="558" text-anchor="middle" fill="${CAPTION}" font-family="${FONT}" font-size="34">${escapeXml(caption)}</text>
</svg>
`
}
```

- [ ] **Step 4: Run the renderer test to verify it passes**

Run: `npx vitest run scripts/productArt.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the file generator**

Create `scripts/generate-product-art.mjs`:

```js
#!/usr/bin/env node
// Writes one SVG per product from src/demo/catalogue.data.json. Output is
// committed: the showcase is a static build with no image pipeline, and the
// Supabase seed points product_images at the same paths. Run with --check in
// lint so an edited catalogue can never ship without its art.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderProductArt } from './productArt.mjs'

const DATA_PATH = 'src/demo/catalogue.data.json'
const OUT_DIR = 'public/images/supplymate/products'
const check = process.argv.includes('--check')

const catalogue = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const expected = new Map(
  catalogue.products.map((product) => [
    `${product.slug}.svg`,
    renderProductArt({
      shape: product.art.shape,
      caption: product.art.caption,
      label: product.name,
      options: product.art.options ?? {},
    }),
  ]),
)

mkdirSync(OUT_DIR, { recursive: true })
const onDisk = readdirSync(OUT_DIR).filter((name) => name.endsWith('.svg'))
const problems = []

for (const [name, svg] of expected) {
  const path = join(OUT_DIR, name)
  const current = onDisk.includes(name) ? readFileSync(path, 'utf8') : null
  if (current === svg) continue

  if (check) {
    problems.push(current === null ? `missing ${name}` : `stale ${name}`)
  } else {
    writeFileSync(path, svg)
  }
}

// An orphan is reported in both modes and deleted in neither: removing files
// this script did not write is not its job. After renaming a slug, delete the
// old SVG by hand.
const orphans = onDisk.filter((name) => !expected.has(name))
for (const name of orphans) {
  console.warn(`orphan illustration (delete by hand): ${join(OUT_DIR, name)}`)
}
if (check) {
  problems.push(...orphans.map((name) => `orphan ${name}`))
}

if (check && problems.length > 0) {
  console.error(
    `${OUT_DIR} is out of date with ${DATA_PATH}:\n  ${problems.join('\n  ')}\n` +
      'Run `npm run generate:catalogue`.',
  )
  process.exit(1)
}

console.log(
  check
    ? `product art check OK (${expected.size} files)`
    : `wrote ${expected.size} product illustrations to ${OUT_DIR}`,
)
```

Note the orphan branch: in write mode an orphan is reported but not deleted, because deleting files this script did not write is not its job — remove a stale file by hand after renaming a slug.

- [ ] **Step 6: Add the npm scripts**

In `package.json`, add `generate:catalogue` after `"lint"` and extend `lint`:

```json
    "lint": "oxlint && node scripts/check-core-boundary.mjs && node scripts/check-database-types.mjs && node scripts/generate-product-art.mjs --check",
    "generate:catalogue": "node scripts/generate-product-art.mjs",
```

(`generate-seed-catalogue.mjs` joins both lines in Task 4.)

- [ ] **Step 7: Generate the art and confirm the check passes**

```bash
npm run generate:catalogue && ls public/images/supplymate/products | wc -l && node scripts/generate-product-art.mjs --check
```

Expected: `wrote 36 product illustrations…`, then `36`, then `product art check OK (36 files)`.

- [ ] **Step 8: Confirm the drift check actually fails**

```bash
printf '<svg/>' > public/images/supplymate/products/clear-cup-16oz.svg && node scripts/generate-product-art.mjs --check; echo "exit=$?"; npm run generate:catalogue
```

Expected: the check prints `stale clear-cup-16oz.svg` and `exit=1`, then the regenerate restores it. A guard that cannot fail is not a guard.

- [ ] **Step 9: Run the full unit suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: both pass.

- [ ] **Step 10: Commit**

```bash
git add scripts/productArt.mjs scripts/productArt.test.mjs scripts/generate-product-art.mjs package.json public/images/supplymate/products && git commit -m "feat: generate one catalogue illustration per product"
```

---

### Task 3: Point the showcase at the shared catalogue

The showcase starts rendering all 36 products with their own art. This is the task that changes what a visitor sees, so the specs pinned to the old six move with it.

**Files:**
- Modify: `src/demo/catalogue.ts`
- Modify: `src/demo/catalogue.test.ts`
- Create: `src/demo/catalogueArt.test.ts`
- Modify: `e2e/static-showcase.spec.ts`

**Interfaces:**
- Consumes: `src/demo/catalogue.data.json`; the SVGs generated in Task 2.
- Produces:
  - `productImagePath(slug: string): string` → `/images/supplymate/products/{slug}.svg`.
  - `DemoCategory { slug, name, description, imagePath }`.
  - `DemoProduct { id, slug, categorySlug, name, description, price, sku, imagePath, packageUnit, unitsPerPackage, minOrderQuantity }`.
  - Unchanged signatures for `findDemoProduct`, `filterDemoProducts`, `clampToMinimum`. Task 5 consumes `DemoCategory.imagePath`, `DemoProduct.sku` and `DemoProduct.categorySlug`.

- [ ] **Step 1: Write the failing loader tests**

Replace `src/demo/catalogue.test.ts` in full:

```ts
import { describe, expect, it } from 'vitest'
import {
  clampToMinimum,
  demoCategories,
  demoProducts,
  filterDemoProducts,
  findDemoProduct,
  productImagePath,
} from './catalogue'

describe('SupplyMate static catalogue', () => {
  it('loads the whole shared catalogue', () => {
    expect(demoProducts).toHaveLength(36)
    expect(demoCategories).toHaveLength(6)
  })

  it('finds a product by its stable URL slug', () => {
    expect(findDemoProduct('clear-cup-16oz')?.name).toBe('แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม')
    expect(findDemoProduct('clear-cup-16oz')?.sku).toBe('SM-CUP-16-DOME')
  })

  it('gives every product its own generated illustration', () => {
    expect(productImagePath('clear-cup-16oz')).toBe(
      '/images/supplymate/products/clear-cup-16oz.svg',
    )
    expect(new Set(demoProducts.map((product) => product.imagePath)).size).toBe(36)
  })

  it('keeps the six photographic category tiles', () => {
    expect(demoCategories.map((category) => category.imagePath)).toEqual([
      '/images/supplymate/cups-lids.png',
      '/images/supplymate/food-containers.png',
      '/images/supplymate/paper-bags.png',
      '/images/supplymate/labels.png',
      '/images/supplymate/bar-tools.png',
      '/images/supplymate/eco-packaging.png',
    ])
  })

  it('matches Thai search and category filters together', () => {
    const inCategory = filterDemoProducts(demoProducts, '', 'cups-lids')
    expect(inCategory).toHaveLength(6)

    // "ฝาโดมใส" appears in one product name only; the bare word "แก้ว" now
    // matches most of the category, which is the point of a deeper catalogue.
    const narrow = filterDemoProducts(demoProducts, 'ฝาโดมใส', 'cups-lids')
    expect(narrow.map((product) => product.slug)).toEqual(['dome-lid-95mm'])
  })

  it('searches the category name as well as the product text', () => {
    const results = filterDemoProducts(demoProducts, 'บรรจุภัณฑ์รักษ์โลก', '')
    expect(results).toHaveLength(6)
  })

  it('clamps invalid and below-minimum quantities to the minimum', () => {
    expect(clampToMinimum(0, 3)).toBe(3)
    expect(clampToMinimum(2.5, 3)).toBe(3)
    expect(clampToMinimum(6, 3)).toBe(6)
  })
})
```

Create `src/demo/catalogueArt.test.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { demoProducts } from './catalogue'

const ART_DIR = 'public/images/supplymate/products'

describe('catalogue art coverage', () => {
  it('ships an illustration for every product', () => {
    const missing = demoProducts.filter((product) => !existsSync(`.${product.imagePath}`))
    expect(missing.map((product) => product.slug)).toEqual([])
  })

  it('keeps no orphaned illustrations behind a renamed slug', () => {
    const onDisk = readdirSync(ART_DIR).filter((name) => name.endsWith('.svg'))
    const expected = demoProducts.map((product) => `${product.slug}.svg`)
    expect(onDisk.sort()).toEqual(expected.sort())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/demo/catalogue.test.ts src/demo/catalogueArt.test.ts`
Expected: FAIL — `productImagePath` is not exported and `demoProducts` still has 6 entries.

- [ ] **Step 3: Rewrite the loader**

Replace the top of `src/demo/catalogue.ts` (everything above `export function findDemoProduct`) with:

```ts
import rawCatalogue from './catalogue.data.json'
import type { PackageUnit } from '../lib/wholesale'

export interface DemoCategory {
  slug: string
  name: string
  description: string
  imagePath: string
}

export interface DemoProduct {
  id: string
  slug: string
  categorySlug: string
  name: string
  description: string
  price: number
  sku: string
  imagePath: string
  packageUnit: PackageUnit
  unitsPerPackage: number
  minOrderQuantity: number
}

const PACKAGE_UNITS: PackageUnit[] = ['carton', 'pack', 'roll', 'case']

// JSON widens `packageUnit` to string. Fail loudly at module load rather than
// letting an unknown unit reach quantityLabel(), which would render undefined.
function toPackageUnit(value: string): PackageUnit {
  const unit = PACKAGE_UNITS.find((candidate) => candidate === value)
  if (!unit) throw new Error(`Unknown package unit in catalogue.data.json: ${value}`)
  return unit
}

/** Derived, never stored: one generated illustration per product slug. */
export function productImagePath(slug: string) {
  return `/images/supplymate/products/${slug}.svg`
}

export const demoCategories: DemoCategory[] = rawCatalogue.categories.map((category) => ({
  slug: category.slug,
  name: category.name,
  description: category.description,
  imagePath: category.imagePath,
}))

export const demoProducts: DemoProduct[] = rawCatalogue.products.map((product) => ({
  id: product.id,
  slug: product.slug,
  categorySlug: product.categorySlug,
  name: product.name,
  description: product.description,
  price: product.price,
  sku: product.sku,
  imagePath: productImagePath(product.slug),
  packageUnit: toPackageUnit(product.packageUnit),
  unitsPerPackage: product.unitsPerPackage,
  minOrderQuantity: product.minOrderQuantity,
}))
```

`findDemoProduct`, `filterDemoProducts` and `clampToMinimum` stay exactly as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/demo && npm run typecheck`
Expected: PASS on all catalogue tests; typecheck exit 0. (`catalogueArt.test.ts` imports `node:fs` from inside `src`; that resolves through the existing `@types/node` devDependency and needs no `tsconfig` change.)

- [ ] **Step 5: Move the showcase specs onto the unified catalogue**

Two edits in `e2e/static-showcase.spec.ts`.

The unified product name drops the space before `พร้อมฝาโดม` (it takes the seed's spelling, which `create_order`'s snapshots and the admin UI already use):

```ts
  await expect(page.getByRole('heading', { name: 'แก้วพลาสติกใส 16 ออนซ์พร้อมฝาโดม' })).toBeVisible()
```

The MOQ test's product `blank-label-roll-50x30` no longer exists; `thermal-label-50x30` is the unified catalogue's thermal label and its minimum is 6 rolls:

```ts
  await page.goto('/#/products/thermal-label-50x30')
  const quantity = page.getByRole('spinbutton', { name: 'จำนวน' })
  await expect(quantity).toHaveValue('6')
  await quantity.fill('1')
  await expect(quantity).toHaveValue('6')
```

- [ ] **Step 6: Run the showcase E2E project**

Run: `npm run test:showcase-e2e`
Expected: PASS. The first spec fails the run on any 4xx from its own origin, so this also proves all 36 SVGs resolve.

If a spec times out at 60s, open `test-results/*/error-context.md` before calling it flaky — in this repo a stale locator always presents as a timeout, not an assertion failure.

- [ ] **Step 7: Commit**

```bash
git add src/demo/catalogue.ts src/demo/catalogue.test.ts src/demo/catalogueArt.test.ts e2e/static-showcase.spec.ts && git commit -m "feat: render the full 36-product catalogue in the showcase"
```

---

### Task 4: Generate the Supabase seed catalogue

Brings the Supabase-backed app to the same 36 products, from the same file.

**Files:**
- Create: `scripts/generate-seed-catalogue.mjs`
- Modify: `supabase/seed.sql`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/demo/catalogue.data.json`.
- Produces: the block between `-- BEGIN generated catalogue …` and `-- END generated catalogue` in `supabase/seed.sql`, containing the `categories`, `products` and `product_images` inserts. Everything below it (`product_variants`, `addresses`, the sample orders) stays hand-written and keeps referencing the fixed product ids.

- [ ] **Step 1: Write the generator**

Create `scripts/generate-seed-catalogue.mjs`:

```js
#!/usr/bin/env node
// The seed's catalogue is generated from src/demo/catalogue.data.json so the
// Supabase app and the static showcase cannot describe different products.
// Only the marked block is rewritten -- variants, addresses and the sample
// orders below it are hand-written and reference these product ids.
import { readFileSync, writeFileSync } from 'node:fs'

const DATA_PATH = 'src/demo/catalogue.data.json'
const SEED_PATH = 'supabase/seed.sql'
const BEGIN = '-- BEGIN generated catalogue -- npm run generate:catalogue -- do not edit by hand'
const END = '-- END generated catalogue'
const check = process.argv.includes('--check')

const catalogue = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const categoryId = new Map(catalogue.categories.map((category) => [category.slug, category.id]))
const text = (value) => `'${String(value).replace(/'/g, "''")}'`
const productImagePath = (slug) => `/images/supplymate/products/${slug}.svg`

for (const product of catalogue.products) {
  if (!categoryId.has(product.categorySlug)) {
    console.error(`${product.slug} names an unknown category: ${product.categorySlug}`)
    process.exit(1)
  }
}

const categoryRows = catalogue.categories
  .map(
    (category) =>
      `  (${text(category.id)}, ${text(category.slug)}, ${text(category.name)},\n` +
      `   ${text(category.description)}, ${text(category.imagePath)}, ${category.sortOrder})`,
  )
  .join(',\n')

const productRows = catalogue.products
  .map(
    (product) =>
      `  (${text(product.id)}, ${text(categoryId.get(product.categorySlug))},\n` +
      `   ${text(product.slug)}, ${text(product.name)},\n` +
      `   ${text(product.description)},\n` +
      `   ${product.price.toFixed(2)}, ${text(product.sku)}, ${product.stockQuantity}, ${product.hasVariants},` +
      ` 'active', ${product.sortOrder},\n` +
      `   ${text(product.packageUnit)}, ${product.unitsPerPackage}, ${product.minOrderQuantity})`,
  )
  .join(',\n')

const imageRows = catalogue.products
  .map(
    (product) =>
      `  (${text(product.id)}, ${text(productImagePath(product.slug))}, ${text(product.name)}, 0)`,
  )
  .join(',\n')

const block = `${BEGIN}
insert into public.categories (id, slug, name, description, image_path, sort_order) values
${categoryRows}
on conflict (id) do nothing;

-- Prices are per package. Every item has local owned imagery, available
-- stock, an explicit pack size, and a database-enforced order minimum.
-- status is written explicitly; is_active is derived by
-- trg_products_sync_is_active and must never be written here.
insert into public.products (
  id, category_id, slug, name, description, price, sku, stock_quantity,
  has_variants, status, sort_order, package_unit, units_per_package, min_order_quantity
) values
${productRows}
on conflict (id) do nothing;

insert into public.product_images (product_id, storage_path, alt, sort_order) values
${imageRows}
on conflict do nothing;
${END}`

const seed = readFileSync(SEED_PATH, 'utf8')
const start = seed.indexOf(BEGIN)
const stop = seed.indexOf(END)
if (start === -1 || stop === -1 || stop < start) {
  console.error(`${SEED_PATH} is missing the generated catalogue markers:\n  ${BEGIN}\n  ${END}`)
  process.exit(1)
}

const next = seed.slice(0, start) + block + seed.slice(stop + END.length)
if (next === seed) {
  console.log('seed catalogue check OK')
  process.exit(0)
}

if (check) {
  console.error(`${SEED_PATH} is out of date with ${DATA_PATH}. Run \`npm run generate:catalogue\`.`)
  process.exit(1)
}

writeFileSync(SEED_PATH, next)
console.log(`rewrote the generated catalogue block in ${SEED_PATH}`)
```

- [ ] **Step 2: Put the markers into the seed**

In `supabase/seed.sql`, delete the three current blocks — the `-- Six buyer-facing supply categories.` comment plus its `insert into public.categories … on conflict (id) do nothing;`, the `-- Prices are per package…` comment plus its `insert into public.products … on conflict (id) do nothing;`, and the whole `insert into public.product_images … on conflict do nothing;` — and put the two marker lines where the categories insert used to start:

```sql
-- BEGIN generated catalogue -- npm run generate:catalogue -- do not edit by hand
-- END generated catalogue
```

Then move the `insert into public.product_variants (…) … on conflict (id) do nothing;` block (with its `-- Variants exist only for choices a buyer genuinely makes…` comment) so it sits **after** the `-- END generated catalogue` line and before the `insert into public.addresses` block. Its six rows and their `product_id` references are unchanged.

- [ ] **Step 3: Generate, and prove the check fails on drift**

```bash
node scripts/generate-seed-catalogue.mjs && node scripts/generate-seed-catalogue.mjs --check && git diff --stat supabase/seed.sql
```

Expected: `rewrote the generated catalogue block…`, then `seed catalogue check OK`, then a diff touching only `supabase/seed.sql`.

Then prove the check fails on a hand-edit *inside* the block — the only drift that matters, since anything outside the markers is left alone by design:

```bash
sed -i '' "s/'SM-CUP-16-DOME', 42/'SM-CUP-16-DOME', 41/" supabase/seed.sql && node scripts/generate-seed-catalogue.mjs --check; echo "exit=$?"; git checkout supabase/seed.sql
```

Expected: the check prints `supabase/seed.sql is out of date…` and `exit=1`, then the checkout restores the generated file.

- [ ] **Step 4: Wire both generators into the npm scripts**

```json
    "lint": "oxlint && node scripts/check-core-boundary.mjs && node scripts/check-database-types.mjs && node scripts/generate-product-art.mjs --check && node scripts/generate-seed-catalogue.mjs --check",
    "generate:catalogue": "node scripts/generate-product-art.mjs && node scripts/generate-seed-catalogue.mjs",
```

- [ ] **Step 5: Reset the database and verify the seed applies**

```bash
supabase start && supabase db reset --yes
```

Expected: no errors. A `products_sku_key` or `products_slug_key` violation means two rows share a SKU or slug — fix the JSON and regenerate, do not edit the SQL.

- [ ] **Step 6: Check what actually landed in Postgres**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select c.slug, count(p.id) as products, count(i.id) as images from categories c join products p on p.category_id = c.id join product_images i on i.product_id = p.id where p.is_active group by c.slug order by min(c.sort_order);"
```

Expected: six rows, `products` and `images` both 6 on each. `is_active` being true across all 36 also proves the `status = 'active'` write reached `trg_products_sync_is_active`.

(If the port differs on this machine, take it from `supabase status`.)

- [ ] **Step 7: Run lint and the full E2E suite**

Run: `npm run lint && npm run test:e2e`
Expected: both pass. This is the run that proves the seeded sample orders still resolve their product ids, and that the specs buying "the first product on `/shop`" still get `clear-cup-16oz`.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-seed-catalogue.mjs supabase/seed.sql package.json && git commit -m "feat: generate the Supabase seed catalogue from the shared data"
```

---

### Task 5: Showcase pages for a catalogue this size

Six products fit on a home page; thirty-six do not. This task makes the browsing shape match the catalogue: photographic category tiles, a curated home page, the product code on the detail page, and a same-category row that gives a buyer somewhere to go next.

**Files:**
- Modify: `src/showcase/ShowcaseCataloguePage.tsx`
- Modify: `src/showcase/ShowcaseProductPage.tsx`
- Modify: `src/showcase/WholesaleFacts.tsx`
- Modify: `src/showcase/showcase.css`
- Modify: `e2e/static-showcase.spec.ts`

**Interfaces:**
- Consumes: `DemoCategory.imagePath`, `DemoProduct.sku`, `DemoProduct.categorySlug`, `demoProducts` (Task 3).
- Produces: no new exported API. `WholesaleFacts` gains an optional `sku?: string` prop.

- [ ] **Step 1: Write the failing E2E expectations**

Append to `e2e/static-showcase.spec.ts`:

```ts
test('curates the home page and offers the rest of the catalogue', async ({ page }) => {
  await page.goto('/#/')

  const featured = page.getByRole('region', { name: 'สินค้าแนะนำจากทุกหมวด' })
  await expect(featured.locator('.wholesale-product-card')).toHaveCount(6)
  await featured.getByRole('link', { name: /ดูสินค้าทั้งหมด 36 รายการ/ }).click()

  await expect(page).toHaveURL(/#\/shop/)
  await expect(page.getByText('พบสินค้า 36 รายการ')).toBeVisible()
  await page.getByRole('button', { name: 'อุปกรณ์บาร์' }).click()
  await expect(page.getByText('พบสินค้า 6 รายการ')).toBeVisible()
})

test('shows the product code and a way into the rest of the category', async ({ page }) => {
  await page.goto('/#/products/milk-pitcher-600ml')
  await expect(page.getByText('SM-BAR-PITCHER-600')).toBeVisible()

  const related = page.getByRole('region', { name: 'สินค้าอื่นในหมวดอุปกรณ์บาร์' })
  await expect(related.locator('.wholesale-product-card')).toHaveCount(3)
  await related.getByRole('link', { name: 'เชคเกอร์สเตนเลส' }).click()
  await expect(page).toHaveURL(/#\/products\/cocktail-shaker/)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:showcase-e2e -- -g "curates the home page|shows the product code"`
Expected: FAIL — no region named `สินค้าแนะนำจากทุกหมวด`, no SKU on the detail page.

- [ ] **Step 3: Curate the home page and use the category photos**

In `src/showcase/ShowcaseCataloguePage.tsx`, replace the `if (mode === 'home')` branch's `categoryTiles` derivation and its featured section.

The tiles now take the category's own photograph rather than borrowing a product's image:

```tsx
  if (mode === 'home') {
    const categoryTiles = demoCategories.map((category) => ({
      ...category,
      productCount: demoProducts.filter((product) => product.categorySlug === category.slug).length,
    }))
    // One product per category: at 36 items, listing the catalogue twice on the
    // home page buries the categories that are the actual way in.
    const featured = demoCategories.flatMap(
      (category) => demoProducts.find((product) => product.categorySlug === category.slug) ?? [],
    )
```

and the second section becomes:

```tsx
        <section aria-labelledby="featured-title">
          <div className="showcase-section-header">
            <div>
              <p className="showcase-eyebrow">สินค้าแนะนำ</p>
              <h2 id="featured-title" className="showcase-section-title">
                สินค้าแนะนำจากทุกหมวด
              </h2>
            </div>
            <Link to="/shop" className="showcase-section-header__link">
              ดูสินค้าทั้งหมด {demoProducts.length.toLocaleString('th-TH')} รายการ
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((product, index) => (
              <ShowcaseProductCard key={product.id} product={product} eager={index === 0} />
            ))}
          </div>
        </section>
```

`aria-labelledby="featured-title"` on a `<section>` is what gives the spec its named region; the heading text and the accessible name therefore have to stay identical.

- [ ] **Step 4: Add the product code row**

In `src/showcase/WholesaleFacts.tsx`, add `sku` to the props interface and render it first — a buyer quoting an order reads the code before anything else:

```tsx
interface WholesaleFactsProps {
  price: number
  packageUnit: PackageUnit
  unitsPerPackage: number
  minOrderQuantity: number
  sku?: string
}

export function WholesaleFacts({ price, packageUnit, unitsPerPackage, minOrderQuantity, sku }: WholesaleFactsProps) {
  return (
    <dl className="wholesale-facts">
      {sku && (
        <div className="wholesale-facts__item">
          <dt>รหัสสินค้า</dt>
          <dd>{sku}</dd>
        </div>
      )}
```

The remaining four `<div className="wholesale-facts__item">` blocks stay exactly as they are.

- [ ] **Step 5: Pass the SKU and add the same-category row**

In `src/showcase/ShowcaseProductPage.tsx`, import the card and the full list:

```tsx
import { demoCategories, demoProducts, findDemoProduct } from '@/demo/catalogue'
import { ShowcaseProductCard } from '@/showcase/ShowcaseProductCard'
```

Pass the code through:

```tsx
        <WholesaleFacts
          price={product.price}
          packageUnit={product.packageUnit}
          unitsPerPackage={product.unitsPerPackage}
          minOrderQuantity={product.minOrderQuantity}
          sku={product.sku}
        />
```

Derive the neighbours just below `const category = …`:

```tsx
  const related = demoProducts
    .filter((item) => item.categorySlug === product.categorySlug && item.slug !== product.slug)
    .slice(0, 3)
```

The page's root is a two-column grid, so the row cannot live inside it. Change the found-product `return` to a fragment wrapping the existing section plus the new one — the existing `<section className="mx-auto grid max-w-5xl gap-8 pb-8 md:grid-cols-2 md:items-start">…</section>` keeps its entire body untouched:

```tsx
  return (
    <>
      <section className="mx-auto grid max-w-5xl gap-8 pb-8 md:grid-cols-2 md:items-start">
        {/* unchanged: image column, breadcrumb, price, facts, stepper, buy bar */}
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="showcase-related mx-auto max-w-5xl">
          <h2 id="related-title" className="showcase-section-title">
            {`สินค้าอื่นในหมวด${category?.name ?? 'แคตตาล็อก'}`}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ShowcaseProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </>
  )
```

The heading is one template literal rather than `สินค้าอื่นในหมวด{category?.name}` on purpose: two adjacent JSX text nodes can be joined with a space during accessible-name computation, and Thai does not put one there — the spec's expected region name (`สินค้าอื่นในหมวดอุปกรณ์บาร์`) has no space in it.

- [ ] **Step 6: Space the new row**

In `src/showcase/showcase.css`, next to the other section rules:

```css
.showcase-related {
  margin-block-start: 3.5rem;
  padding-block-start: 2rem;
  border-block-start: 1px solid var(--border);
}
```

- [ ] **Step 7: Run the showcase suite**

Run: `npm run test:showcase-e2e`
Expected: PASS, including the two new tests and the two older ones updated in Task 3.

- [ ] **Step 8: Run the unit suite, lint and typecheck**

Run: `npm run test:unit && npm run lint && npm run typecheck`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/showcase e2e/static-showcase.spec.ts && git commit -m "feat: curate the showcase home page and surface product codes"
```

---

### Task 6: Visual pass, full verification, and documentation

Generated line art is the one part of this work no test can judge. This task looks at it, fixes what reads wrong, and closes out.

**Files:**
- Modify: `scripts/productArt.mjs` (only if the visual pass finds a broken drawing)
- Modify: `src/demo/catalogue.data.json` (only to retune an `art` spec)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no new API.

- [ ] **Step 1: Open the showcase**

Start the preview with the Browser pane: `preview_start` with `{name: "showcase"}` — that configuration already exists in `.claude/launch.json` (`npm run dev` on port 5173). Never start a dev server through Bash.

- [ ] **Step 2: Look at every illustration at card size**

Navigate to `/#/shop` and screenshot the grid, then scroll and screenshot until all 36 cards have been seen. Check each drawing against this bar:

- The subject sits on the ground line, inside the frame, not clipped by the 640×640 viewBox.
- The caption is legible and does not collide with the drawing.
- No two products in the same category are indistinguishable at card size.
- Nothing renders as an empty frame.

Fix problems in `scripts/productArt.mjs` (geometry) or in the product's `art.options` (proportions), then `npm run generate:catalogue` and re-screenshot. Repeat until the grid passes.

- [ ] **Step 3: Check the pages that show art at other sizes**

- `/#/products/clear-cup-16oz` — the detail image is `aspect-square … object-cover`, so confirm nothing important is cropped.
- `/#/cart` after adding an item — cart line thumbnails.
- `/#/` — category tiles must still be the photographs, not SVGs.

- [ ] **Step 4: Check mobile**

Resize to 375×812 and reload `/#/shop`. Confirm no horizontal scroll and that captions stay readable. `resize_window` back to desktop afterwards.

- [ ] **Step 5: Check the console and network**

Run `read_console_messages` and `read_network_requests`. Expected: no errors and no 404s under `/images/supplymate/products/`.

- [ ] **Step 6: Document the pipeline**

Add this section to `CLAUDE.md`, directly above `## Cart, checkout, payment slip`:

```markdown
## Catalogue data

- **`src/demo/catalogue.data.json` is the single source of truth for categories and
  products** — 6 categories × 6 products. The static showcase reads it through
  `src/demo/catalogue.ts`, and `supabase/seed.sql`'s catalogue block is generated from it.
  Editing either consumer by hand is the mistake: edit the JSON and run
  `npm run generate:catalogue`.
- **Two generators, both with a `--check` mode wired into `npm run lint`:**
  `scripts/generate-product-art.mjs` writes `public/images/supplymate/products/{slug}.svg`
  (one per product, from that product's `art` spec, via the pure renderer in
  `scripts/productArt.mjs`), and `scripts/generate-seed-catalogue.mjs` rewrites only the
  block between `-- BEGIN generated catalogue` and `-- END generated catalogue` in
  `supabase/seed.sql`. Variants, addresses and the sample orders below that block stay
  hand-written and reference the fixed product ids, so **a product's `id` in the JSON is
  not free to change** — `b1000000-…-0001/0005/0010/0018` are named by the seeded orders.
- **A product's image path is derived, never stored:**
  `/images/supplymate/products/{slug}.svg`. Renaming a slug renames its art; the orphan
  file must be deleted by hand (the generator reports orphans but never deletes).
- **The six photographic PNGs are category tiles and the hero only.** Product cards use the
  generated line art — thirty-six cards sharing six photos is what made the catalogue read
  as a demo. The SVGs carry literal hex colours and a `system-ui` font stack with
  Latin-only captions, because an `<img>`-loaded SVG cannot reach the page's tokens or a
  webfont.
- **Generated SQL writes `products.status`, never `is_active`** (`trg_products_sync_is_active`
  derives it), and every product carries a distinct non-empty `sku` — `products.sku` is
  `unique`, so a blank one breaks on the second row.
- Two showcase E2E specs are pinned to catalogue values: `static-showcase.spec.ts` uses
  `clear-cup-16oz`'s exact name and `thermal-label-50x30`'s MOQ of 6. `clear-cup-16oz` must
  also keep `sort_order = 1` — several Supabase specs buy "the first product on `/shop`".
```

- [ ] **Step 7: Run everything**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

Expected: all pass. Report the actual output; if a spec fails, read `test-results/*/error-context.md` before calling it a flake.

- [ ] **Step 8: Confirm the static build still excludes Supabase**

```bash
npm run build && npm run test:showcase-artifact
```

Expected: build succeeds and the static-showcase assertion passes (36 SVGs in `public/` do not change what Rollup drops, but this is the guard that says so).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "docs: describe the generated catalogue pipeline"
```

---

## Out of scope (deliberately)

- **Volume price tiers.** `product_price_tiers` exists and `TierLadder` renders it, but no seeded product uses one, so the tier ladder never appears in either surface. Seeding a few breaks would be a visible realism win — it is a separate change, and it cannot be mirrored into the static showcase without new showcase UI.
- **Re-encoding the six PNGs.** They are ~2 MB each at 1254², which is heavy for a category tile. Out of scope here; worth its own pass.
- **Pagination on the showcase `/shop`.** 36 filtered cards on one page is fine; the Supabase app already paginates at 12.
