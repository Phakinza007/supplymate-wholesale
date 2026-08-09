# SupplyMate B2B Wholesale Redesign

## Goal

Transform the static SupplyMate Wholesale showcase into a credible Thai B2B distributor storefront. It must look like a real wholesale business for restaurants, cafés, and central kitchens while remaining a local-data-only concept demo on GitHub Pages.

## Product Positioning

SupplyMate is a dependable wholesale ordering surface, not a discount marketplace and not a consumer retail shop. The design should make a buyer understand three things immediately:

1. The catalogue is for restaurant and café supplies.
2. Every product shows its wholesale unit and minimum order quantity clearly.
3. The site is a concept demo and cannot receive or store real orders.

## Visual Direction

Use a warm, operational B2B palette rather than the existing neutral application shell:

- Paper background: `#F5F1E8`
- Ink / structural green: `#173B32`
- Product green: `#26765A`
- Terracotta accent: `#D96945`
- Warm line / panel tones derived from the paper background

Typography remains the existing Thai-safe stack. Layout should use generous but practical spacing, high-contrast order information, and restrained editorial product imagery. Avoid gradients, discount graphics, fake stock counters, invented shipping promises, or fabricated reviews.

## Shell and Route Design

All routes continue to use `HashRouter` and the existing memory-only Zustand cart.

### Shared shell

- A thin top utility strip states the buyer context without claiming a real shipping or support service.
- The header holds the brand, catalogue link, demo-order explanation link, and cart count.
- `Concept demo — ไม่รับคำสั่งซื้อจริง` remains visible in the content flow on every route. It is restyled as a branded demo-mode notice rather than a generic alert.
- A new footer closes every route with category navigation, the demo disclosure, and a short local-data-only statement.

### Home

- Replace the bare card hero with a two-column hero.
- The left column contains the B2B value proposition and an explicit catalogue CTA.
- The right column is a product collage built exclusively from the existing local product imagery.
- Category links become image-led tiles. Each tile uses the matching local product asset as an editorial crop and retains an accessible text label.
- Featured products sit in a structured wholesale grid beneath the category tiles.

### Catalogue

- Keep URL-backed search and category state.
- Turn the controls into a catalogue toolbar with a labelled search field, active category chips, result count, and a clear-filter action when needed.
- Product cards show product name, unit price, unit/pack information, MOQ, and calculated per-item value when a product has a known units-per-package value.

### Product, cart, and checkout

- Product detail uses a larger visual product panel and a dedicated wholesale facts block for unit, pack size, MOQ, and per-item value.
- Cart uses a visual order summary with wholesale line items, quantities, and subtotal.
- Checkout remains simulated. Confirmation must explicitly say that no customer information, payment, or order is saved.

## Component Boundaries

Keep route components focused and extract reusable display pieces under `src/showcase/`:

- `ShowcaseHeader`: utility strip, primary navigation, cart count.
- `ShowcaseFooter`: closing navigation and concept disclosure.
- `ShowcaseHero`: home-only B2B introduction and image collage.
- `ShowcaseCategoryTile`: image-led catalogue category link.
- `ShowcaseProductCard`: reusable product presentation for home and catalogue.
- `WholesaleFacts`: unit, package size, MOQ, and derived per-item value.
- `WholesaleOrderSummary`: reusable subtotal and line-item presentation for cart and checkout.

The existing `assetUrl.ts` helper remains the only way showcase components reference local public images, so GitHub Pages base-path deployment stays correct.

## CSS Strategy

1. Update global tokens in `src/index.css` for the new palette and Thai typography baseline.
2. Add `src/showcase/showcase.css` for named design primitives that do not belong in one route component: the utility strip, collage, editorial tiles, wholesale facts, demo notice, footer, hover/focus treatments, and reduced-motion rules.
3. Continue to use Tailwind utilities for layout, sizing, responsive breakpoints, and route-local spacing. Do not introduce another CSS framework or animation dependency.
4. Every interaction gets a visible keyboard focus state. Hover-only information must remain present in the base card content.
5. Under `prefers-reduced-motion: reduce`, transforms and transitions are removed rather than replaced with an alternate animation.

## Interaction Strategy

Use React state and existing router/store state; do not introduce imperative DOM scripts.

- Search and category filters continue to update `useSearchParams`.
- The cart remains memory-only and clears after simulated confirmation.
- Product/tile/card movement is CSS-only: a small image lift and border-color transition on hover/focus.
- A clear-filter control is conditionally shown only when search text or a category is active.
- The cart count is visually prominent but its accessible label remains a full Thai sentence.

## Constraints

- No database, Supabase, auth, payment, delivery, or order persistence.
- No new npm dependencies.
- Use existing local product assets only; no external image URLs.
- Preserve all current catalogue data, MOQ clamping, memory cart behaviour, hash routes, and static artefact rules.
- Preserve the exact demo disclosure text: `Concept demo — ไม่รับคำสั่งซื้อจริง`.
- Maintain a 375 × 812 layout with no horizontal overflow.

## Acceptance Criteria

- The deployed app reads as a B2B wholesale storefront at first glance and does not make a real-order claim.
- Home, catalogue, product detail, cart, checkout, empty-cart, and simulated confirmation routes share the new shell.
- Search, category links, product links, MOQ clamping, cart updates, checkout confirmation, and route fallbacks retain their existing behaviour.
- All showcase image URLs resolve under the GitHub Pages base path.
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build:pages`, and `npm run test:showcase-artifact` pass.
- A Playwright smoke flow at 375 × 812 completes browse → product → cart → simulated confirmation with no console or same-origin resource errors and no horizontal overflow.
