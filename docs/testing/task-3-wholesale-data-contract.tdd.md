# Task 3 wholesale data contract: TDD evidence

## Scope resolution

Task 3 validates the wholesale contract directly against local Supabase. Product-detail pack copy belongs to Task 4, while browser checkout and buyer-visible fulfilment copy belong to Task 6. The earlier UI-oriented RED commit `9d2dc54` is retained in history as evidence of that plan conflict, but it is not this task's GREEN target.

The replacement test, `e2e/supplymate-data-contract.spec.ts`, exercises real PostgREST/Auth behavior without mocks:

1. Sign up a fresh buyer and insert an address under that buyer's RLS scope.
2. Read the seeded `clear-cup-16oz` wholesale package metadata.
3. Call the six-argument `create_order` RPC by supplying `p_business_details`.
4. Attempt to rewrite the business snapshot through the seeded admin account.
5. Read the order as the buyer and assert the original trimmed Thai business details remain.

## RED checkpoint

The uncommitted migration, seed, and generated types were stashed before resetting the local database, so this run used the pre-wholesale schema.

```bash
git stash push -u -m "task-3-wholesale-production-wip" -- \
  src/lib/database.types.ts supabase/seed.sql \
  supabase/migrations/20260807000100_supplymate_wholesale.sql
npm run test:e2e -- e2e/supplymate-data-contract.spec.ts
```

Outcome: **1 failed** at the wholesale product query with PostgreSQL `42703`: `column products.package_unit does not exist`. Authentication and address creation completed before the expected missing-contract failure. The corrected RED test is commit `a1e90e8` (`test: define SupplyMate wholesale data contract`).

## GREEN checkpoint

The production stash was restored, and the identical test command performed a clean reset that applied `20260807000100_supplymate_wholesale.sql` and the SupplyMate seed.

```bash
git stash pop stash@{0}
npm run test:e2e -- e2e/supplymate-data-contract.spec.ts
```

Outcome: **1 passed**. The buyer read `package_unit = carton`, `units_per_package = 1000`, and `min_order_quantity = 1`; `create_order` trimmed and stored the Thai business snapshot; the immutability trigger neutralized the admin rewrite; and buyer RLS returned the original values.

Implementation commit: `4b4e30a` (`feat: model SupplyMate wholesale orders`).

## Additional validation

```bash
supabase db reset --yes
supabase gen types typescript --local > /tmp/supplymate-database.types.ts
npm run typecheck
npm run lint
npm run test:e2e
```

- Clean database reset: passed, including migrations and seed.
- Generated contract: contains all new product/order fields and `Functions.create_order.Args.p_business_details`; the tracked file preserves `__InternalSupabase.PostgrestVersion`.
- Typecheck: passed.
- Lint/boundary/type-contract gates: passed with the pre-existing Fast Refresh warning in `src/components/ui/button.tsx`.
- Full E2E suite: 9 passed, 1 skipped. The skipped reviews test is expected because SupplyMate disables reviews.
- Database inspection: 6 categories, 18 products, 6 buyer-choice variants, and 18 local SupplyMate image references.
- Function inspection: only the six-argument `create_order` overload exists; both checkout RPCs remain `SECURITY DEFINER`, pin `search_path = public, pg_temp`, and grant execution only to `authenticated` (plus owner).
- Payment-slip check: a transaction-scoped replacement attachment cleared `payment_rejection_reason`, then rolled back.

## Deferred validation

No Task 3 validation was unavailable. UI pack/minimum assertions are intentionally deferred to Task 4, and Thai checkout/fulfilment browser assertions are intentionally deferred to Task 6 under the approved scope split.
