# SupplyMate Static Showcase Design

## Goal

Publish SupplyMate Wholesale on GitHub Pages as a self-initiated, interactive Thai
commerce concept demo. It must work with no hosted Supabase project, secrets,
login, payment processing, or persisted customer data.

## Scope

The deployed demo shows one buyer journey:

1. Browse a Thai wholesale catalogue.
2. Open a product and see its price, unit, pack size, and minimum order.
3. Add products to a browser-only cart and adjust quantities without going below
   the minimum.
4. Complete a simulated order and see a clear non-production confirmation.

Every page carries an explicit `Concept demo — ไม่รับคำสั่งซื้อจริง` notice. There
are no login, sign-up, password, account, order history, slip-upload, payment,
admin, promotion, review, or inventory-management routes in the deployed app.

## Architecture

The Pages build uses a dedicated `ShowcaseApp` route tree and imports no Supabase
or auth code. The existing production-oriented application files may remain in
the repository as reference code, but the GitHub Pages entry point must select
only the showcase tree at build time.

`src/demo/catalogue.ts` owns six representative catalogue records and category
metadata. Each record uses a generated local image under
`/images/supplymate/`, stable ids/slugs, a Thai name/description, a numeric
price, one allowed package unit (`carton`, `pack`, `roll`, or `case`), a
positive `unitsPerPackage`, and a positive `minOrderQuantity`. It is the
single source of truth for home, catalogue, and product-detail screens.

The existing Zustand cart remains client-side only. It displays the static
catalogue snapshot and enforces minimum order quantities locally. Checkout is a
form-free confirmation action: it clears the cart in memory and presents a
generated demo reference. It must never make a network request or imply a
payment was taken.

## Routes and UI

`HashRouter` makes all GitHub Pages routes reload-safe.

| Route | Purpose |
|---|---|
| `#/` | hero, demo disclosure, category links, and featured products |
| `#/shop` | filterable catalogue with Thai search and categories |
| `#/products/:slug` | product detail and MOQ-aware add-to-cart control |
| `#/cart` | editable browser-only cart and subtotal |
| `#/checkout` | non-production order confirmation; no buyer data captured |

The header exposes only `สินค้า` and `ตะกร้า`. The disclosure appears under the
header and adjacent to the simulated order action. Button labels and empty
states are Thai. Money uses the existing `formatPrice` helper and units use the
existing wholesale-label helpers.

## Deployment

The GitHub Pages workflow builds with `VITE_DEPLOY_TARGET=github-pages` and
`VITE_SHOWCASE_MODE=true`. It removes the Supabase-secrets preflight and does
not expose any credentials. Deployment remains manual (`workflow_dispatch`).

The repository secrets previously created for the incompatible `ecom` Supabase
project are not consumed by this build and should be removed once the static
deployment is verified.

## Errors, accessibility, and verification

Unknown product slugs show a Thai not-found state with a route back to the
catalogue. Quantity controls clamp invalid or below-minimum values to the
product minimum. Cart operations do not require a network connection.

Unit tests cover catalogue lookup/filtering and quantity clamping. Verification
includes `npm run typecheck`, `npm run lint`, `npm run test:unit`, and
`npm run build:pages`; the Pages artifact must not contain the hosted Supabase
URL or API key. The deployed homepage and catalogue are checked at 375×812 for
horizontal overflow and browser-console errors before portfolio integration.
