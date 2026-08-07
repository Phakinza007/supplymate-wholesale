# Reviews Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 2 "Reviews" optional module — verified-purchase product reviews, displayed
on the product detail page, submitted from either the product page or order history — without
touching core behavior when the `reviews` feature flag is off.

**Architecture:** A new `reviews` table + `submit_review()` SECURITY DEFINER RPC (mirroring
`create_order`/`attach_payment_slip`'s existing pattern), a self-contained module under
`src/modules/optional/reviews/` (hooks + the default-exported `Reviews` component), and two small,
`<Feature flag="reviews">`-gated additions to core files (`ProductDetailPage.tsx`,
`OrderDetailPage.tsx`) that lazy-load the module so it never enters the bundle when the flag is off.

**Tech Stack:** Same as the rest of the project — Supabase (Postgres/RLS/RPC), React 19,
`@tanstack/react-query`, `react-router-dom` v7, shadcn/ui primitives (`Button`, `Input`, `Label`).

## Global Constraints

- **Verified-purchase only.** A customer may review a product only if they have an `orders` row
  with `status = 'done'` containing that `product_id` — enforced server-side in the RPC, not just
  the UI (the order-history entry point is a convenience link, never a trust boundary).
- **No moderation queue.** Reviews publish immediately on submit. Admin can only toggle
  `is_active` (hide/unhide) — never a hard delete from the app, matching this project's
  "deactivate, never delete" convention for products/categories.
- **One review per customer per product, editable.** Enforced by a DB-level
  `unique (product_id, user_id)` constraint; the RPC upserts on that key.
- **Privacy: no reviewer full name is displayed.** The design's original wording ("reviewer name")
  is refined here after reading the schema — `profiles.full_name` is the customer's real name, and
  showing it to anonymous site visitors on a public product page is an unnecessary PII exposure standard
  e-commerce sites avoid (they show "Verified Buyer" or similar). This plan displays rating + comment
  + date only, no name, and skips embedding `profiles` in the reviews query entirely — simpler and
  more private.
- **`src/core` must never import from `src/modules/optional`** — verified mechanically by
  `scripts/check-core-boundary.mjs`, which only matches static `from '...'` imports. The two core
  files this plan touches use `React.lazy(() => import('@/modules/optional/reviews'))` (a dynamic
  call expression, not a `from` import), which is the sanctioned pattern already documented in
  `src/lib/Feature.tsx`'s own doc comment.
- **The `reviews` feature flag stays `false` in the committed `branding.config.ts`.** This plan
  ships the module and its wiring, not the flag flip — enabling it is a one-line per-client decision
  made later, outside this plan.
- **Exact existing conventions this plan's SQL must match** (copied from reading the real
  migrations, not guessed): `SECURITY DEFINER` functions use `set search_path = public, pg_temp`
  and end with an explicit `revoke execute ... from public, anon; grant execute ... to
  authenticated;` (see `create_order`/`attach_payment_slip` in
  `supabase/migrations/20250101000500_order_functions.sql`). Public-read + admin-write RLS pairs
  follow the `"<table>: public read" for select to anon, authenticated using (is_active)` /
  `"<table>: admin write" for all to authenticated using (public.is_admin()) with check
  (public.is_admin())` shape used for `products`/`categories` in
  `supabase/migrations/20250101000300_catalog.sql`. `updated_at` columns use the existing
  `public.set_updated_at()` trigger function via `trg_<table>_updated_at`. Foreign keys to
  `products(id)`/`profiles(id)` use `on delete cascade` (matches `product_images`, `addresses`).
- **`order_items.product_slug` already exists and is always populated** by `create_order()` (see
  `supabase/migrations/20250101000500_order_functions.sql:104,140`) — no new column or join is
  needed to link an order line back to its product page.
- **Automated E2E coverage for this module is deferred, not silently dropped.** Playwright's
  `webServer` runs `vite --mode e2e` against the real, checked-out `branding.config.ts` — feature
  flags in this project are compile-time constants, not env-driven, so a spec exercising the Reviews
  UI can only pass while the flag is `true`, which conflicts with shipping it `false` by default.
  Rather than either (a) architecting env-overridable flags (real scope creep beyond this module) or
  (b) shipping the flag on to get automated coverage (contradicts the approved design), Task 5 does
  one-time verification with the flag temporarily flipped locally, via a throwaway Playwright spec
  that is run once and then deleted — never committed, never part of `npm run test:e2e`'s permanent
  suite.

---

### Task 1: Database schema — `reviews` table + `submit_review()` RPC

**Files:**
- Create: `supabase/migrations/20250101000900_reviews.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: table `public.reviews` (`id`, `product_id`, `user_id`, `rating`, `comment`,
  `is_active`, `created_at`, `updated_at`), RPC `public.submit_review(p_product_id uuid, p_rating
  smallint, p_comment text default null) returns public.reviews`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20250101000900_reviews.sql`:

```sql
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_id_idx on public.reviews (product_id) where is_active;

create trigger trg_reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy "reviews: public read" on public.reviews for select to anon, authenticated
  using (is_active);
create policy "reviews: admin write" on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The only way a customer review gets written -- validates the caller
-- actually has a `done` order containing this product before allowing the
-- write, then upserts on (product_id, user_id) so re-reviewing edits the
-- existing row instead of creating a duplicate. Mirrors create_order()'s
-- SECURITY DEFINER + explicit grant pattern.
create or replace function public.submit_review(
  p_product_id uuid,
  p_rating     smallint,
  p_comment    text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_review public.reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.user_id = v_uid
       and o.status = 'done'
       and oi.product_id = p_product_id
  ) then
    raise exception 'you can only review products you have purchased' using errcode = '42501';
  end if;

  insert into public.reviews (product_id, user_id, rating, comment)
  values (p_product_id, v_uid, p_rating, p_comment)
  on conflict (product_id, user_id)
  do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into v_review;

  return v_review;
end;
$$;

revoke execute on function public.submit_review(uuid, smallint, text) from public, anon;
grant  execute on function public.submit_review(uuid, smallint, text) to authenticated;
```

- [ ] **Step 2: Apply the migration to the local stack and confirm it succeeds**

```bash
supabase db reset
```

Expected: the reset log includes `Applying migration 20250101000900_reviews.sql...` with no error,
and finishes with the usual `Seeding data from supabase/seed.sql...` / `Finished supabase db reset`
lines (the reviews table has no seed rows — nothing in `seed.sql` needs to change).

- [ ] **Step 3: Regenerate `src/lib/database.types.ts` from the local stack**

```bash
supabase gen types typescript --local > src/lib/database.types.ts
```

Expected: the file now includes a `reviews` entry under `Tables` (with `Row`/`Insert`/`Update`
shapes matching Step 1's columns) and a `submit_review` entry under `Functions`. Run `npm run
typecheck` afterward — it must still pass (this file is pure generated types, nothing references
`reviews` yet).

- [ ] **Step 4: Verify the RPC directly against the local stack**

Using the seeded local accounts (`admin@example.com`/`password123` has no `done` orders for
products it didn't buy; use `customer@example.com`/`password123`, which `seed.sql` gives a `done`
order for `trucker-cap`, product id `b1000000-0000-0000-0000-000000000004` — confirm this is still
accurate by re-reading `supabase/seed.sql`'s order-status-advancing section before relying on it).
Get an access token and call the RPC via curl:

```bash
TOKEN=$(curl -s -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H "apikey: $(grep VITE_SUPABASE_ANON_KEY .env.e2e.local | cut -d= -f2)" \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

curl -s -X POST 'http://127.0.0.1:54321/rest/v1/rpc/submit_review' \
  -H "apikey: $(grep VITE_SUPABASE_ANON_KEY .env.e2e.local | cut -d= -f2)" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"p_product_id":"b1000000-0000-0000-0000-000000000004","p_rating":5,"p_comment":"Great cap"}'
```

Expected: a `200` response with a JSON object containing `"rating":5,"comment":"Great cap"`. Then
confirm the eligibility gate by attempting a review for a product this customer never bought (e.g.
`b1000000-0000-0000-0000-000000000002`, the hoodie, unless `seed.sql` shows otherwise) — expected: a
non-200 error containing "you can only review products you have purchased". Clean up the row this
step created (`delete from public.reviews where product_id =
'b1000000-0000-0000-0000-000000000004'` via `supabase db reset` at the start of the next task is
sufficient — no separate cleanup command needed since every task in this plan starts from a fresh
local DB per this project's established E2E workflow).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20250101000900_reviews.sql src/lib/database.types.ts
git commit -m "feat(reviews): add reviews table, RLS, and submit_review RPC"
```

---

### Task 2: Reviews module — data hooks

**Files:**
- Create: `src/modules/optional/reviews/useProductReviews.ts`
- Create: `src/modules/optional/reviews/useReviewEligibility.ts`
- Create: `src/modules/optional/reviews/useReviewMutations.ts`

**Interfaces:**
- Consumes: Task 1's `reviews` table and `submit_review` RPC; `@/lib/supabase`; `@/core/auth/useAuth`.
- Produces (consumed by Task 3):
  - `useProductReviews(productId: string)` — TanStack Query hook, `data` is an array of `{ id,
    rating, comment, is_active, created_at, user_id }`.
  - `useReviewEligibility(productId: string, userId: string | undefined)` — TanStack Query hook,
    `data` is `boolean` (true if the caller has a `done` order containing this product).
  - `useReviewMutations(productId: string)` — returns `{ submitReview, setReviewActive }`, both
    TanStack `useMutation` results. `submitReview.mutate({ rating: number, comment: string })`.
    `setReviewActive.mutate({ reviewId: string, isActive: boolean })`.

- [ ] **Step 1: Write `useProductReviews.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductReviews(productId: string) {
  return useQuery({
    queryKey: ['reviews', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, rating, comment, is_active, created_at, user_id')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!productId,
  })
}
```

- [ ] **Step 2: Write `useReviewEligibility.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useReviewEligibility(productId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['review-eligibility', userId, productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, orders!inner(status)')
        .eq('product_id', productId)
        .eq('orders.status', 'done')
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
    enabled: !!userId && !!productId,
  })
}
```

This relies on `order_items`' existing `"order_items: read own"` RLS policy (scoped to the caller's
own orders via a subquery on `orders.user_id`) plus `orders`' own `"orders: read own"` policy on the
embedded `orders!inner(status)` relation — a signed-in customer's query naturally returns only rows
from their own orders, so no explicit `.eq('user_id', ...)` is needed or possible (there is no
`user_id` column on `order_items`).

- [ ] **Step 3: Write `useReviewMutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useReviewMutations(productId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['reviews', productId] })

  const submitReview = useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      const { error } = await supabase.rpc('submit_review', {
        p_product_id: productId,
        p_rating: input.rating,
        p_comment: input.comment || null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setReviewActive = useMutation({
    mutationFn: async (input: { reviewId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('reviews')
        .update({ is_active: input.isActive })
        .eq('id', input.reviewId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { submitReview, setReviewActive }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: passes. These three files aren't imported from anywhere yet, so this only confirms they
compile against the regenerated `database.types.ts` in isolation.

- [ ] **Step 5: Commit**

```bash
git add src/modules/optional/reviews/useProductReviews.ts \
  src/modules/optional/reviews/useReviewEligibility.ts \
  src/modules/optional/reviews/useReviewMutations.ts
git commit -m "feat(reviews): add data hooks for reviews module"
```

---

### Task 3: Reviews module — UI component

**Files:**
- Create: `src/modules/optional/reviews/index.tsx`
- Delete: `src/modules/optional/reviews/.gitkeep` (no longer needed once the directory has a real file)

**Interfaces:**
- Consumes: Task 2's `useProductReviews`, `useReviewEligibility`, `useReviewMutations`;
  `@/core/auth/useAuth` (`{ user }`); `@/core/auth/useProfile` (`{ data: profile }`, `profile.role`);
  `@/components/ui/button`, `@/components/ui/input`; `react-router-dom`'s `useSearchParams`.
- Produces (consumed by Tasks 4 and 5): default export `Reviews({ productId }: { productId: string
  })` — a React component, importable as `import Reviews from '@/modules/optional/reviews'` or via
  `React.lazy(() => import('@/modules/optional/reviews'))`.

- [ ] **Step 1: Write `src/modules/optional/reviews/index.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/core/auth/useAuth'
import { useProfile } from '@/core/auth/useProfile'
import { useProductReviews } from '@/modules/optional/reviews/useProductReviews'
import { useReviewEligibility } from '@/modules/optional/reviews/useReviewEligibility'
import { useReviewMutations } from '@/modules/optional/reviews/useReviewMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'

export default function Reviews({ productId }: { productId: string }) {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const isAdmin = profile?.role === 'admin'
  const { data: reviews, isLoading, isError } = useProductReviews(productId)
  const ownReview = reviews?.find((r) => r.user_id === user?.id)
  const { data: eligible } = useReviewEligibility(productId, ownReview ? undefined : user?.id)
  const { submitReview, setReviewActive } = useReviewMutations(productId)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating)
      setComment(ownReview.comment ?? '')
    }
  }, [ownReview])

  useEffect(() => {
    if (searchParams.get('review') === '1') {
      formRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [searchParams])

  if (isLoading) return null
  if (isError) return <p className="text-sm text-destructive">Failed to load reviews.</p>

  const activeReviews = (reviews ?? []).filter((r) => r.is_active)
  const average =
    activeReviews.length > 0
      ? activeReviews.reduce((sum, r) => sum + r.rating, 0) / activeReviews.length
      : null
  const canShowForm = !!user && (!!ownReview || eligible === true)

  return (
    <div className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-lg font-medium">Reviews</h2>
      {average !== null ? (
        <p className="text-sm text-muted-foreground">
          {average.toFixed(1)} ★ ({activeReviews.length} review
          {activeReviews.length === 1 ? '' : 's'})
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(reviews ?? []).map((r) => (
          <li key={r.id} className={'rounded-md border p-3 text-sm' + (r.is_active ? '' : ' opacity-50')}>
            <div className="flex items-center justify-between">
              <span>{'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}</span>
              <span className="text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString()}
                {!r.is_active && ' (hidden)'}
              </span>
            </div>
            {r.comment && <p className="mt-1">{r.comment}</p>}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={setReviewActive.isPending}
                onClick={() => setReviewActive.mutate({ reviewId: r.id, isActive: !r.is_active })}
              >
                {r.is_active ? 'Hide' : 'Unhide'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canShowForm && (
        <div ref={formRef} className="flex flex-col gap-3 rounded-md border p-4">
          <h3 className="font-medium">{ownReview ? 'Edit your review' : 'Write a review'}</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                onClick={() => setRating(n)}
                className="text-xl"
              >
                {n <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment"
            className="min-h-20 rounded-md border p-2 text-sm"
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button
            disabled={rating === 0 || submitReview.isPending}
            onClick={async () => {
              setFormError(null)
              try {
                await submitReview.mutateAsync({ rating, comment })
              } catch (err) {
                setFormError(getErrorMessage(err, 'Failed to submit review.'))
              }
            }}
          >
            {submitReview.isPending ? 'Submitting…' : ownReview ? 'Update review' : 'Submit review'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unnecessary placeholder**

```bash
rm src/modules/optional/reviews/.gitkeep
```

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both pass. `npm run lint`'s core-boundary check is unaffected — this file lives inside
`src/modules/optional`, which the boundary script never scans (it only walks `src/core`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/optional/reviews/index.tsx
git rm src/modules/optional/reviews/.gitkeep
git commit -m "feat(reviews): add Reviews module UI component"
```

---

### Task 4: Wire the module into core (ProductDetailPage + OrderDetailPage)

**Files:**
- Modify: `src/core/catalog/ProductDetailPage.tsx`
- Modify: `src/core/orders/OrderDetailPage.tsx`

**Interfaces:**
- Consumes: Task 3's default-exported `Reviews` component (via dynamic `import()` only — never a
  static `from` import, per the Global Constraints boundary rule); `@/lib/Feature`'s `Feature`
  component.

- [ ] **Step 1: Add the lazy-loaded Reviews block to `ProductDetailPage.tsx`**

The current file (`src/core/catalog/ProductDetailPage.tsx`) imports at the top:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { useCartStore } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
```

Change the first line and add two new imports, so the top of the file reads:

```tsx
import { lazy, Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProduct } from '@/core/catalog/useProduct'
import { resolveImageUrl } from '@/lib/resolveImageUrl'
import { formatPrice } from '@/lib/formatPrice'
import { useCartStore } from '@/core/cart/cartStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Feature } from '@/lib/Feature'

const Reviews = lazy(() => import('@/modules/optional/reviews'))
```

Then, inside the `<div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-12">` returned by
the component, immediately after the closing `</div>` of the `<div className="grid gap-8
md:grid-cols-2">` block (i.e. right before the final `</div>` that closes the whole component,
currently the last two lines of the function body), add:

```tsx
      <Feature flag="reviews">
        <Suspense fallback={null}>
          <Reviews productId={product.id} />
        </Suspense>
      </Feature>
```

So the end of the returned JSX becomes:

```tsx
      </div>

      <Feature flag="reviews">
        <Suspense fallback={null}>
          <Reviews productId={product.id} />
        </Suspense>
      </Feature>
    </div>
  )
}
```

- [ ] **Step 2: Add "Write a review" links to `OrderDetailPage.tsx`**

The current file (`src/core/orders/OrderDetailPage.tsx`) imports:

```tsx
import { useState, type ChangeEvent } from 'react'
import { useParams } from 'react-router-dom'
```

Change to:

```tsx
import { useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
```

And add one import for `Feature`:

```tsx
import { Feature } from '@/lib/Feature'
```

Then change the order-items rendering block from:

```tsx
      <div className="flex flex-col gap-2 border-y py-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.product_name} × {item.quantity}
            </span>
            <span>{formatPrice(item.line_total ?? item.unit_price * item.quantity)}</span>
          </div>
        ))}
```

to:

```tsx
      <div className="flex flex-col gap-2 border-y py-4">
        {order.order_items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span>
              {item.product_name} × {item.quantity}
              {order.status === 'done' && item.product_slug && (
                <Feature flag="reviews">
                  {' · '}
                  <Link
                    to={`/products/${item.product_slug}?review=1`}
                    className="text-primary underline"
                  >
                    Write a review
                  </Link>
                </Feature>
              )}
            </span>
            <span>{formatPrice(item.line_total ?? item.unit_price * item.quantity)}</span>
          </div>
        ))}
```

`item.product_slug` is already selected by this query's `select('*, order_items(*)')` (it's a plain
column on `order_items`, included by `*`) and is always populated by `create_order()` — no query
change needed here.

- [ ] **Step 3: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all three pass. This is the step that actually proves the core/optional boundary holds —
`scripts/check-core-boundary.mjs` runs as part of `npm run lint` and must still print `core/optional
boundary OK`.

- [ ] **Step 4: Commit**

```bash
git add src/core/catalog/ProductDetailPage.tsx src/core/orders/OrderDetailPage.tsx
git commit -m "feat(reviews): wire Reviews module into product and order-history pages"
```

---

### Task 5: Verification (flag on locally, never committed) + bundle-exclusion check (flag off)

**Files:**
- Create (temporary, deleted before this task's final commit): `e2e/_reviews-manual.spec.ts`
- No permanent file changes — this task's only committed artifact (if any issues are found) would
  be fixes to earlier tasks' files, not new files.

**Interfaces:**
- Consumes: everything from Tasks 1-4. Consumes `e2e/helpers/auth.ts` and `e2e/helpers/checkout.ts`
  from the existing Step 8 E2E infrastructure (`signUp`, `logIn`, `uniqueEmail`, `addAddress`,
  `buyFirstProductAndUploadSlip`) — read those two files first to confirm their exact current
  signatures before writing the spec below.

- [ ] **Step 1: Temporarily enable the flag for local verification**

Edit `src/config/branding.config.ts`, changing `reviews: false` to `reviews: true` inside the
`features` object. **Do not commit this change** — it's reverted in Step 5 below.

- [ ] **Step 2: Write a throwaway Playwright spec exercising the full module**

Create `e2e/_reviews-manual.spec.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress, buyFirstProductAndUploadSlip } from './helpers/checkout'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SLIP_PATH = path.join(__dirname, 'fixtures', 'payment-slip.pdf')

test('reviews module: eligible customer can review, ineligible cannot, admin can hide', async ({ browser }) => {
  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()

  await signUp(customerPage, {
    fullName: 'Review Customer',
    email: uniqueEmail('review-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Review Customer',
    phone: '0891234567',
    line1: '1 Review Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  const { orderUrl } = await buyFirstProductAndUploadSlip(customerPage, SLIP_PATH)

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/orders')
  await adminPage.getByRole('link', { name: /Order #/ }).first().click()
  await adminPage.getByRole('button', { name: 'Verify payment' }).click()
  await adminPage.getByRole('button', { name: 'Mark as shipped' }).click()
  await adminPage.getByRole('button', { name: 'Mark as done' }).click()
  await expect(adminPage.getByText('Status: done')).toBeVisible()

  // Follow the order-history "Write a review" link (proves the order-history wiring).
  await customerPage.goto(orderUrl)
  const reviewLink = customerPage.getByRole('link', { name: 'Write a review' })
  await expect(reviewLink).toBeVisible()
  const reviewHref = await reviewLink.getAttribute('href')
  await customerPage.goto(reviewHref!)

  await customerPage.getByRole('button', { name: 'Rate 5 stars' }).click()
  await customerPage.getByPlaceholder('Optional comment').fill('Excellent product')
  await customerPage.getByRole('button', { name: 'Submit review' }).click()
  await expect(customerPage.getByText('Excellent product')).toBeVisible()
  await expect(customerPage.getByText('5.0 ★ (1 review)')).toBeVisible()

  // A second, ineligible customer sees no review form on the same product.
  const strangerContext = await browser.newContext()
  const strangerPage = await strangerContext.newPage()
  await signUp(strangerPage, {
    fullName: 'Stranger',
    email: uniqueEmail('stranger'),
    password: 'password123',
  })
  await strangerPage.goto(reviewHref!.split('?')[0])
  await expect(strangerPage.getByText('Excellent product')).toBeVisible()
  await expect(strangerPage.getByRole('button', { name: 'Submit review' })).toHaveCount(0)

  // Admin hides the review; it disappears from the public (stranger) view.
  await adminPage.goto(reviewHref!.split('?')[0])
  await adminPage.getByRole('button', { name: 'Hide' }).click()
  await strangerPage.reload()
  await expect(strangerPage.getByText('Excellent product')).toHaveCount(0)

  await customerContext.close()
  await adminContext.close()
  await strangerContext.close()
})
```

- [ ] **Step 3: Run it against a freshly-reset local stack**

```bash
supabase db reset
npm run test:e2e -- _reviews-manual.spec.ts
```

Expected: `1 passed`. If any locator doesn't match (e.g. button `aria-label` text, or the average-
rating string format), fix `src/modules/optional/reviews/index.tsx` from Task 3 to match — this
step is the real behavioral proof for the whole module, not just this spec file.

- [ ] **Step 4: Confirm the module is excluded from the production bundle with the flag off**

```bash
git diff src/config/branding.config.ts   # confirm it currently shows reviews: true (uncommitted)
git checkout -- src/config/branding.config.ts   # revert to the committed reviews: false
npm run build
grep -r "you can only review products you have purchased" dist/assets/*.js || echo "NOT FOUND (expected)"
```

Expected: the `grep` finds nothing (prints "NOT FOUND (expected)") — that error string only exists
inside the RPC's error path as surfaced by `getErrorMessage`, but more directly: confirm the
module's own distinctive UI string doesn't appear either:

```bash
grep -r "Write a review" dist/assets/*.js && echo "UNEXPECTED: reviews module leaked into the bundle"
```

Wait for this second grep too — if `Write a review` (used in `OrderDetailPage.tsx`'s link and
`Reviews`'s form heading) appears in the built bundle while the committed flag is `false`, that's a
real bug in the `Feature`/`lazy()` wiring from Task 4, not something to wave through.

- [ ] **Step 5: Delete the throwaway spec and confirm no unintended diffs remain**

```bash
rm e2e/_reviews-manual.spec.ts
git status --short
```

Expected: `git status --short` shows nothing (clean tree) — `branding.config.ts` was already
reverted in Step 4, and this spec file was never committed. If `git status` shows anything other
than expected build artifacts already covered by `.gitignore`, investigate before proceeding.

- [ ] **Step 6: Final full-suite regression check**

```bash
npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Expected: all pass, including the existing Step 8 suite (`golden-path.spec.ts` + `security.spec.ts`,
3 passed) — confirming this module's changes to `OrderDetailPage.tsx`/`ProductDetailPage.tsx`
haven't broken anything the existing E2E coverage already protects.

No commit for this task — Step 5 already confirmed a clean working tree with nothing new to commit.
