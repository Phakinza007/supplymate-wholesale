# Step 8 — Playwright E2E Test: Design

## Context

This is the last Build order step (Step 8) in CLAUDE.md. Steps 0-7 (scaffold through admin order
management) are done and merged to `main`. The spec calls for: "Playwright covering the golden
path against seeded mock data ... plus the two checks that protect the boilerplate's core promise
— a non-admin is denied the admin area, and a user cannot read another user's slip." No test
runner is wired up yet; this step wires one up.

## Decisions

- **Environment: local Supabase stack, not the hosted dev project.** `supabase/seed.sql` is
  documented as local-dev-only ("run via `supabase db reset`; never push it to a hosted
  project"). Running E2E against the hosted project would mean creating/deleting real test users
  and orders there, and conflicts with that rule. The suite instead runs entirely against
  `supabase start`'s local stack, reset before every run.
- **CI: out of scope.** No `.github/workflows/*` is added. This step wires up a suite runnable via
  `npm run test:e2e`; automated-pipeline integration is a future concern, deliberately left out
  for a boilerplate that gets cloned per client (a CI workflow is one more thing every clone would
  inherit and have to adapt).
- **Docker/Supabase CLI as a documented prerequisite, not auto-installed.** The plan adds an npm
  `pretest:e2e` hook that runs `supabase start && supabase db reset -y`; it assumes Docker is
  running and the Supabase CLI is installed, and fails loudly with the CLI's own error message if
  not. Installing/starting Docker Desktop itself is a one-time local environment step, not
  something a plan task should try to automate.

## Architecture

- **Runner:** `@playwright/test`, tests under `e2e/`, config at `playwright.config.ts`.
- **DB lifecycle:** `npm run pretest:e2e` (`supabase start && supabase db reset -y`) runs before
  `npm run test:e2e` (via npm's automatic pre-script convention), so every run starts from a clean
  DB with `seed.sql`'s catalog data and no leftover users/orders from a prior run.
- **App target:** Playwright's `webServer` config starts `vite --mode e2e`, which reads a new
  `.env.e2e` file pointing at the **local** stack's URL (`http://127.0.0.1:54321`) and anon key.
  These are the Supabase CLI's fixed, publicly-documented local-dev demo values (identical across
  every local Supabase project unless a project overrides them in `config.toml`, which this repo
  does not) — safe to commit, unlike the hosted project's real anon key in `.env`.
- **Admin promotion:** no UI path exists for this, by design (CLAUDE.md: "there is no UI path to
  do this (by design, to block self-promotion)"). A test helper (`e2e/helpers/db.ts`) opens a
  direct `pg` connection to the local stack's Postgres
  (`postgres://postgres:postgres@127.0.0.1:54322/postgres` — the Supabase CLI's fixed local-only
  superuser credentials) and runs `update public.profiles set role = 'admin' where email = $1`,
  mirroring the exact bootstrap step CLAUDE.md documents for real clients.
- **Customer/admin isolation:** two separate Playwright `browser.newContext()` instances (two
  independent cookie jars / localStorage), not one shared page reused for both roles — this models
  two real, simultaneous browser sessions, which is what the golden path actually requires (the
  customer's order confirmation page must still be reachable while the admin verifies it).

## Test data

- Each run signs up a fresh customer through the **real signup UI** (unique email per run, e.g.
  `customer-${Date.now()}@example.com`) — registration is part of the golden path itself, not a
  shortcut taken to reach later steps.
- A second account is signed up the same way and promoted to admin via the `pg` helper, used only
  for the admin half of the golden path and the cross-user slip-access security check.
- `seed.sql`'s existing catalog data (categories/products) supplies the product the customer buys
  — no new catalog fixtures are needed.
- A small checked-in fixture file, `e2e/fixtures/payment-slip.pdf` (a minimal valid PDF, a few KB),
  stands in for the uploaded payment slip.

## Test files

### `e2e/golden-path.spec.ts`

Single end-to-end flow, one spec, one test (steps are sequential and interdependent — this is
deliberately not split into many small `test()` blocks, since e.g. "admin verifies" only makes
sense after "customer checks out"):

1. Register a new customer via `/signup` (`#fullName`, `#email`, `#password`) — local stack has
   `enable_confirmations = false`, so signup immediately produces a session and redirects to `/`.
2. Go to `/account/addresses`, add one address (needed before checkout will allow placing an
   order — `CheckoutPage` disables "Place order" with zero addresses on file).
3. Go to `/shop`, open the first product link (`a[href^="/products/"]`), add it to cart.
4. Go to `/cart`, then `/checkout`; the one saved address auto-selects; click "Place order".
5. Assert landing on `/orders/:orderId`; assert `Status: pending`.
6. Upload `e2e/fixtures/payment-slip.pdf` via the page's file input; assert the "Payment slip
   received" message.
7. Register the second (admin) account, promote it via the `pg` helper, and open a **second
   browser context** logged in as that admin.
8. In the admin context: go to `/admin/orders`, open the order (matched by the order number shown
   on the customer's confirmation, or by being the only order in a freshly-reset DB), click
   "Verify payment", then "Mark as shipped" (filling `#tracking`/`#carrier`), then "Mark as done".
9. Back in the customer context, reload `/orders/:orderId` and assert `Status: done`.

### `e2e/security.spec.ts`

Two independent `test()` blocks:

1. **Non-admin denied `/admin`:** a plain customer session (fresh signup, no promotion) navigates
   to `/admin` and the test asserts the resulting URL is `/` (matches `<AdminRoute />`'s documented
   redirect-non-admins-to-`/` behavior).
2. **Cross-user slip access denied:** customer A signs up, uploads a payment slip (reusing steps
   1-6 of the golden path's flow, factored into a shared helper), recording the slip's storage
   path. Customer B (a second, independent signed-up session) calls
   `supabase.storage.from('payment-slips').createSignedUrl(<A's path>, 60)` directly via the
   `@supabase/supabase-js` client **in the browser context's own JS**, not through any UI (the UI
   never exposes another user's path — this test targets the actual RLS/storage-policy boundary
   CLAUDE.md calls out, not a UI gap). Asserts the call returns an error, not a URL.

## Config

- `playwright.config.ts`: `testDir: './e2e'`, `baseURL: 'http://localhost:5173'`, `webServer: {
  command: 'vite --mode e2e', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI
  }`, `fullyParallel: false` and a single worker — tests share one reset DB and the admin-promotion
  helper mutates shared rows, so parallel workers would race each other.
- `package.json`: add `"pretest:e2e": "supabase start && supabase db reset -y"` and
  `"test:e2e": "playwright test"`.
- New `devDependencies`: `@playwright/test`, `pg` (for the local DB helper only — never imported by
  app code, so it doesn't affect the storefront bundle).
- New `.env.e2e` (committed): local stack's fixed demo `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`.

## Out of scope

- CI/pipeline integration (see Decisions above).
- Variant, review, Q&A, or any other Phase-2/optional-module flows — Phase 1 core only, matching
  every other step's scope.
- Testing the "reject slip" / "cancel order" admin actions, or the customer-facing gap around
  rejection-reason visibility (CLAUDE.md's own documented "known gap, not yet built") — the golden
  path only exercises the happy path through to `done`, per the spec's literal wording ("golden
  path ... plus the two checks").
