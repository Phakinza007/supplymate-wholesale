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
- `npm run typecheck` — typecheck only
- `npm run lint` — oxlint, the core/optional import boundary check, and the generated-artifact
  checks (product art, seed catalogue, hosted catalogue)
- `npm run generate:catalogue` — regenerate everything derived from
  `src/demo/catalogue.data.json`
- `npm run test:unit` — run the unit-test suite
- `npm run preview` — preview the production build

## Rules

- Branding (colors/logo/name) and feature flags live only in `src/config/branding.config.ts`.
- `src/core/**` must never import from `src/modules/optional/**` — enforced by
  `npm run lint` via `scripts/check-core-boundary.mjs`.
- Optional modules are reached through `<Feature flag="...">` + `React.lazy()` so a disabled
  module never enters the production bundle.

## Deployment

Production is Vercel: `https://supplymate-wholesale.vercel.app`. The project deploys the real
Supabase-backed app — `VITE_SHOWCASE_MODE`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
set as Vercel environment variables, and `vercel.json`'s rewrite is what lets `BrowserRouter`
serve deep links. Deploy with `vercel --prod`.

**The live storefront's products come from the hosted Supabase project, not from
`supabase/seed.sql`** (that file is local-dev only). Load or refresh them by running
`docs/showcase-catalogue.sql` once in the hosted project's SQL Editor — it is generated from
`src/demo/catalogue.data.json`, archives whatever is currently on the storefront instead of
deleting it, and is safe to re-run.

GitHub Pages was the earlier target and is retired. The base-path and hash-router branches it
needed (`VITE_DEPLOY_TARGET=github-pages`, `src/lib/githubPagesAuth.ts`) are still in the code
and dormant; nothing sets that variable any more.

SupplyMate is a self-initiated, non-commercial concept demo. It does not carry real customer
data.

## Pre-deploy smoke test

1. Browse a local product, add one permitted pack, and complete checkout with a business name.
2. Upload the fixture slip as the buyer.
3. Verify, ship with a carrier/tracking number, and complete it as admin.
4. Reopen the buyer order and verify status, tracking, and reasons render in Thai.
5. Load `/admin` while signed out and confirm redirection to `/login`.
