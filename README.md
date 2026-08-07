# SupplyMate Wholesale

Thai self-initiated B2B wholesale demo built from the Commerce Starter Kit source revision
`47014c99bdcdf4fc4386bbd462929be85a1b49ad`. Each client is a separate repo clone paired with
its own Supabase project — not a multi-tenant SaaS. See `CLAUDE.md` for the full spec,
architecture rules, and build order.

## SupplyMate acceptance path

- A buyer sees a Thai catalogue with pack unit and minimum order before adding an item.
- Checkout records a business name and optional tax/branch details with the order.
- A customer can see a payment-rejection explanation, carrier, tracking number, and cancellation reason.
- An admin can see the immutable business snapshot, verify/reject a slip, ship, complete, and cancel an order.

## Stack

React (Vite) + TypeScript + Tailwind v4 + shadcn/ui · Supabase (Auth/Postgres/Storage) ·
GitHub Pages-ready static frontend · Zustand · TanStack Query

## Getting started

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — typecheck + production build
- `npm run build:pages` — build for `/supplymate-wholesale/` with hash-based routing
- `npm run typecheck` — typecheck only
- `npm run lint` — oxlint + the core/optional import boundary check
- `npm run test:unit` — run the unit-test suite
- `npm run preview` — preview the production build

## Rules

- Branding (colors/logo/name) and feature flags live only in `src/config/branding.config.ts`.
- `src/core/**` must never import from `src/modules/optional/**` — enforced by
  `npm run lint` via `scripts/check-core-boundary.mjs`.
- Optional modules are reached through `<Feature flag="...">` + `React.lazy()` so a disabled
  module never enters the production bundle.

## GitHub Pages release status

The source and manual deployment workflow are prepared for
`https://phakinza007.github.io/supplymate-wholesale/`, but that URL is not a deployed demo yet.
A release remains pending until an owned hosted Supabase project is configured and the repository
secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. The workflow fails before upload
when either secret is empty, and it can only be started manually.

The hosted Supabase Auth URL configuration must allow this redirect URL:

```text
https://phakinza007.github.io/supplymate-wholesale/
```

Password-recovery emails request the browser-side callback
`https://phakinza007.github.io/supplymate-wholesale/#/reset-password`. That full redirect URL is
supplied to Supabase, but its fragment is stripped for server-side allowlist matching, so the
Supabase redirect allowlist entry remains the base URL above. The browser also does not include
the fragment in its HTTP request to GitHub Pages. On return, the app consumes the recovery session
before routing and removes token-bearing or auth-error URL fragments.

No hosted credentials or payment credentials belong in this repository. SupplyMate is a
self-initiated, non-commercial concept demo and must not process real payments or customer data.

## Pre-deploy smoke test

1. Browse a local product, add one permitted pack, and complete checkout with a business name.
2. Upload the fixture slip as the buyer.
3. Verify, ship with a carrier/tracking number, and complete it as admin.
4. Reopen the buyer order and verify status, tracking, and reasons render in Thai.
5. Load `/admin` while signed out and confirm redirection to `/login`.
