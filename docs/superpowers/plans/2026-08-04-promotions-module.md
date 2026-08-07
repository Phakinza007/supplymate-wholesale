# Promotions Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add discount/promo codes at checkout — admin manages codes (percent or fixed, optional
min-subtotal/max-uses/expiry), a customer applies one before placing an order, and the discount
flows through to order history — without changing checkout behavior for any order when the
`promotions` flag is off.

**Architecture:** One real migration (the first of the three Phase 2 modules built so far to need
one from the start): a new `promotions` table, a new `orders.promo_code` snapshot column, an
updated `enforce_order_immutability()`, a new read-only `validate_promo_code()` RPC for live UI
feedback, and `create_order()` gaining a `p_promo_code` parameter that re-validates and applies the
discount server-side — never trusting the client's earlier validation call. Two lazy-loaded module
components (`PromotionsAdminPage`, a genuinely new top-level admin section; `PromoCodeField`, a
controlled child of `CheckoutPage.tsx`) plus small core-file wiring.

**Tech Stack:** Same as the rest of the project — Supabase (Postgres/RLS/RPC), React 19,
`@tanstack/react-query`, `react-router-dom` v7, shadcn/ui primitives.

## Global Constraints

- **`create_order()`'s current, real signature is the one from the Variants module's own fix
  migration** (`supabase/migrations/20250101001000_variant_order_validation.sql`), not the original
  `20250101000500_order_functions.sql` version — read the former, not the latter, before touching
  this function again.
- **Adding a parameter to `create_order()` changes its Postgres overload signature.**
  `create or replace function` only replaces a function with the *exact same* parameter list;
  adding `p_promo_code text default null` as a 5th parameter creates a **second, distinct
  overload** (`create_order(jsonb, uuid, jsonb, text, text)`) alongside the existing 4-parameter
  one, rather than replacing it — leaving both callable and the old one still lacking promo
  support. Task 1's migration MUST `drop function if exists public.create_order(jsonb, uuid, jsonb,
  text);` immediately before `create or replace function public.create_order(..., p_promo_code text
  default null)`, so exactly one overload exists afterward. Verify with
  `select count(*) from pg_proc where proname = 'create_order';` — must return `1`.
- **`create_order()` re-validates the promo code from scratch, never trusting
  `validate_promo_code()`'s earlier response** — the same "a client-visible check and a
  server-side enforcement of the same rule must both independently exist" lesson the Variants
  module's final review reinforced (that module shipped with exactly this gap around variant
  validity and had to be fixed in a follow-up migration). Do not skip the re-validation inside
  `create_order()` just because `validate_promo_code()` already checked it.
- **Race-safe redemption counting**: `create_order()` must lock the promotion row (`for update`)
  before checking `max_uses` and incrementing `uses_count` — mirrors the existing row-lock on the
  product row (`for no key update of p`) during cart pricing. Two concurrent checkouts against the
  last remaining use of a capped code must not both succeed.
- **A fixed-amount discount is clamped to the subtotal** (`least(discount_value, subtotal)`) — it
  can never produce a negative order total.
- **`promotions` has NO public/customer read policy at all** — admin-only RLS (`select`/`insert`/
  `update`/`delete`, all gated on `public.is_admin()`), matching the post-`20250101000700_advisor_
  fixes.sql` split-policy convention used everywhere else. A customer never queries this table
  directly; every interaction goes through `validate_promo_code()`/`create_order()`.
- **Codes are case-insensitively unique**: `create unique index promotions_code_unique_idx on
  public.promotions (upper(code));`, and both RPCs compare via `upper(code) = upper(p_code)`.
- **`orders.promo_code`** is added to `enforce_order_immutability()`'s *always*-locked field list
  (`new.promo_code := old.promo_code;`, unconditional — not inside the `if old.status <> 'pending'`
  branch that guards `discount_total`/`shipping_fee`) — a promo is set once at creation and must
  never be attachable or swappable afterward, at any status.
- **Regenerate `database.types.ts` with `--schema public`** (`supabase gen types typescript --local
  --schema public > src/lib/database.types.ts`) — the Reviews module's final review found that
  omitting `--schema public` pulls in ~570 unrelated lines from the `storage`/`graphql_public`
  schemas and drops the `__InternalSupabase` block; every regeneration since has used this flag and
  this plan does too.
- **RPC optional-argument values: send `undefined`, never `null`, for an omitted `p_promo_code`.**
  The generated TypeScript type for an RPC argument with a SQL `default null` is `p_promo_code?:
  string` (optional-string), not `string | null` — this exact class of type mismatch was found and
  fixed in the Reviews module (`p_comment: input.comment || undefined`, not `|| null`). Checkout's
  `placeOrder` call must use `appliedPromo?.code ?? undefined`.
- **Discount display in `OrderDetailPage.tsx`/`AdminOrderDetailPage.tsx` needs no `<Feature>`
  gating** — `order.discount_total`/`order.promo_code` are server-computed snapshot fields, always
  zero/null with the flag off, so a bare `{order.discount_total > 0 && ...}` conditional is safe
  and inert — same reasoning as the Variants module's variant-name display.
- **`CheckoutPage.tsx`'s applied-promo state needs no `<Feature>` gating either, for an even
  stronger reason than the display fields above**: `appliedPromo` is pure client-side React state
  that can *only* ever be set by `PromoCodeField`'s `onApply` callback — a component that itself
  only ever mounts inside `<Feature flag="promotions">`. With the flag off, `PromoCodeField` never
  renders, `onApply` never fires, `appliedPromo` stays `null` for the lifetime of the page. The
  `{appliedPromo && ...}` discount-summary line is therefore provably inert, not just conventionally
  safe.
- **`src/core` must never import from `src/modules/optional`** — every core-file change below uses
  `React.lazy(() => import('@/modules/optional/promotions/...'))`, the same sanctioned dynamic-
  import pattern used throughout the Reviews and Variants modules.
- **The `promotions` feature flag stays `false` in the committed `branding.config.ts`.**
- **Ship the E2E spec as a permanent, flag-guarded file from the start** (`test.skip(!brandConfig
  .features.promotions, ...)`) — the pattern established by Reviews (after learning the hard way)
  and continued by Variants.

---

### Task 1: Database schema — `promotions` table, `orders.promo_code`, `validate_promo_code()`, updated `create_order()`

**Files:**
- Create: `supabase/migrations/20250101001100_promotions.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: table `public.promotions` (`id`, `code`, `discount_type`, `discount_value`,
  `min_subtotal`, `max_uses`, `uses_count`, `expires_at`, `is_active`, timestamps); column
  `public.orders.promo_code`; RPC `public.validate_promo_code(p_code text, p_subtotal numeric)
  returns table (valid boolean, reason text, discount_type text, discount_value numeric,
  discount_amount numeric)`; RPC `public.create_order(p_items jsonb, p_address_id uuid default
  null, p_shipping_address jsonb default null, p_note text default null, p_promo_code text default
  null) returns public.orders` (same return shape as before, one new trailing parameter).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20250101001100_promotions.sql`:

```sql
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  discount_type  text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_subtotal   numeric(12,2) check (min_subtotal is null or min_subtotal >= 0),
  max_uses       integer check (max_uses is null or max_uses > 0),
  uses_count     integer not null default 0,
  expires_at     timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index promotions_code_unique_idx on public.promotions (upper(code));

create trigger trg_promotions_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

create policy "promotions: admin read" on public.promotions for select to authenticated
  using (public.is_admin());
create policy "promotions: admin insert" on public.promotions for insert to authenticated
  with check (public.is_admin());
create policy "promotions: admin update" on public.promotions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "promotions: admin delete" on public.promotions for delete to authenticated
  using (public.is_admin());

alter table public.orders add column promo_code text;

-- promo_code joins the always-locked field list (unconditional, unlike
-- discount_total/shipping_fee which stay pending-mutable for other reasons
-- this migration doesn't touch) -- a promo is set once at creation and must
-- never be attachable or swappable afterward, at any order status.
create or replace function public.enforce_order_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.id           := old.id;
  new.order_number := old.order_number;
  new.user_id      := old.user_id;
  new.created_at   := old.created_at;
  new.subtotal     := old.subtotal;
  new.shipping_address := old.shipping_address;
  new.customer_name    := old.customer_name;
  new.customer_phone   := old.customer_phone;
  new.promo_code       := old.promo_code;

  if old.status <> 'pending' then
    new.discount_total := old.discount_total;
    new.shipping_fee   := old.shipping_fee;
  end if;

  new.total := new.subtotal - new.discount_total + new.shipping_fee;
  return new;
end;
$$;

-- Read-only check for live checkout UI feedback -- never mutates uses_count.
-- create_order() re-validates every one of these conditions itself; this
-- function's result is never trusted at order-creation time.
create or replace function public.validate_promo_code(
  p_code     text,
  p_subtotal numeric
)
returns table (
  valid           boolean,
  reason          text,
  discount_type   text,
  discount_value  numeric,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo public.promotions%rowtype;
begin
  select * into v_promo from public.promotions where upper(code) = upper(p_code);

  if not found then
    return query select false, 'code not found', null::text, null::numeric, null::numeric;
    return;
  end if;
  if not v_promo.is_active then
    return query select false, 'code is no longer active', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.expires_at is not null and v_promo.expires_at < now() then
    return query select false, 'code has expired', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.max_uses is not null and v_promo.uses_count >= v_promo.max_uses then
    return query select false,
      'code has reached its usage limit', null::text, null::numeric, null::numeric;
    return;
  end if;
  if v_promo.min_subtotal is not null and p_subtotal < v_promo.min_subtotal then
    return query select false,
      format('order must be at least %s', v_promo.min_subtotal), null::text, null::numeric, null::numeric;
    return;
  end if;

  return query select
    true, null::text, v_promo.discount_type, v_promo.discount_value,
    case
      when v_promo.discount_type = 'percent' then round(p_subtotal * v_promo.discount_value / 100, 2)
      else least(v_promo.discount_value, p_subtotal)
    end;
end;
$$;

revoke execute on function public.validate_promo_code(text, numeric) from public, anon;
grant  execute on function public.validate_promo_code(text, numeric) to authenticated;

-- create_order() gains a trailing p_promo_code parameter. This CHANGES THE
-- OVERLOAD SIGNATURE (create or replace only replaces a function with the
-- exact same parameter list) -- the drop below is required so the old
-- 4-parameter overload doesn't linger alongside this new 5-parameter one.
drop function if exists public.create_order(jsonb, uuid, jsonb, text);

create or replace function public.create_order(
  p_items            jsonb,
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,
  p_note             text    default null,
  p_promo_code       text    default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_addr     public.addresses%rowtype;
  v_ship     jsonb;
  v_name     text;
  v_phone    text;
  v_subtotal numeric(12,2);
  v_shipping numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_promo    public.promotions%rowtype;
  v_order    public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;

  if p_address_id is not null then
    select * into v_addr from public.addresses where id = p_address_id and user_id = v_uid;
    if not found then
      raise exception 'address not found' using errcode = '42501';
    end if;
    v_ship  := to_jsonb(v_addr) - 'user_id' - 'created_at' - 'updated_at' - 'is_default';
    v_name  := v_addr.recipient_name;
    v_phone := v_addr.phone;
  else
    if p_shipping_address is null then
      raise exception 'shipping address required' using errcode = '22023';
    end if;
    v_ship  := p_shipping_address;
    v_name  := coalesce(p_shipping_address->>'recipient_name', '');
    v_phone := coalesce(p_shipping_address->>'phone', '');
    if v_name = '' or v_phone = '' then
      raise exception 'recipient name and phone are required' using errcode = '22023';
    end if;
  end if;

  create temporary table _cart on commit drop as
  select
    p.id                                          as product_id,
    v.id                                          as variant_id,
    p.name                                        as product_name,
    p.slug                                        as product_slug,
    v.name                                        as variant_name,
    coalesce(v.sku, p.sku)                        as sku,
    (select pi.storage_path from public.product_images pi
      where pi.product_id = p.id order by pi.sort_order limit 1) as image_path,
    coalesce(v.price_override, p.price)::numeric(12,2)           as unit_price,
    i.quantity
  from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity integer)
  join public.products p on p.id = i.product_id and p.is_active
  left join public.product_variants v
         on v.id = i.variant_id and v.product_id = p.id and v.is_active
  where i.quantity > 0
    and (i.variant_id is null or v.id is not null)
  for no key update of p;

  if (select count(*) from _cart) <> jsonb_array_length(p_items) then
    raise exception 'one or more items are unavailable' using errcode = '22023';
  end if;
  -- stock-automation module hooks in here: check + decrement stock_quantity.

  select coalesce(sum(round(unit_price * quantity, 2)), 0) into v_subtotal from _cart;
  v_shipping := public.calc_shipping_fee(v_subtotal);

  -- Apply and re-validate the promo code SERVER-SIDE -- never trust the
  -- client's earlier validate_promo_code() response. Locks the promotion
  -- row so a max_uses check+increment can't race a concurrent checkout.
  if p_promo_code is not null then
    select * into v_promo from public.promotions
     where upper(code) = upper(p_promo_code)
     for update;

    if not found
       or not v_promo.is_active
       or (v_promo.expires_at is not null and v_promo.expires_at < now())
       or (v_promo.max_uses is not null and v_promo.uses_count >= v_promo.max_uses)
       or (v_promo.min_subtotal is not null and v_subtotal < v_promo.min_subtotal)
    then
      raise exception 'promo code is invalid or no longer available' using errcode = '22023';
    end if;

    v_discount := case
      when v_promo.discount_type = 'percent' then round(v_subtotal * v_promo.discount_value / 100, 2)
      else least(v_promo.discount_value, v_subtotal)
    end;

    update public.promotions set uses_count = uses_count + 1 where id = v_promo.id;
  end if;

  insert into public.orders (
    user_id, address_id, shipping_address, customer_name, customer_phone, customer_email,
    customer_note, subtotal, discount_total, shipping_fee, total, promo_code
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, v_discount, v_shipping, v_subtotal - v_discount + v_shipping,
    case when p_promo_code is not null then upper(p_promo_code) else null end
  ) returning * into v_order;

  insert into public.order_items (
    order_id, product_id, variant_id, product_name, product_slug,
    variant_name, sku, image_path, unit_price, quantity
  )
  select v_order.id, product_id, variant_id, product_name, product_slug,
         variant_name, sku, image_path, unit_price, quantity
    from _cart;

  return v_order;
end;
$$;

revoke execute on function public.create_order(jsonb, uuid, jsonb, text, text) from public, anon;
grant  execute on function public.create_order(jsonb, uuid, jsonb, text, text) to authenticated;
```

- [ ] **Step 2: Apply the migration and verify exactly one `create_order` overload exists**

```bash
supabase db reset
```

Expected: `Applying migration 20250101001100_promotions.sql...` with no error, reset completes.

```bash
docker exec supabase_db_ecom psql -U postgres -d postgres -c \
  "select proname, pronargs from pg_proc where proname = 'create_order';"
```

Expected: exactly **one** row, `pronargs = 5`. If two rows appear, the `drop function if exists`
didn't run before the `create or replace` (check migration ordering) — this must be fixed before
proceeding to any other step.

- [ ] **Step 3: Regenerate `database.types.ts`**

```bash
supabase gen types typescript --local --schema public > src/lib/database.types.ts
```

Expected: includes a `promotions` table entry, `validate_promo_code` and the 5-parameter
`create_order` under `Functions`, and the file still contains `__InternalSupabase: {
PostgrestVersion: ... }` at the top (confirms the `--schema public` flag was used correctly). Run
`npm run typecheck` — must still pass.

- [ ] **Step 4: Verify both RPCs directly against the local stack**

Using the seeded `customer@example.com`/`password123` account, get an access token (same curl
pattern as prior modules' verification steps — see `e2e/helpers/*.ts` or any earlier task's report
for the exact curl invocation) and:

1. Create a test promotion directly via SQL (as the reset seed has none):
   ```sql
   insert into public.promotions (code, discount_type, discount_value)
   values ('PLANTEST10', 'percent', 10);
   ```
2. Call `validate_promo_code` for `'PLANTEST10'` with some subtotal — expect `valid: true`,
   `discount_amount` = 10% of that subtotal.
3. Call `validate_promo_code` for a nonexistent code — expect `valid: false`, `reason: 'code not
   found'`.
4. Call `create_order` with `p_promo_code: 'plantest10'` (lowercase, proving case-insensitivity)
   for a cart this customer can legitimately order — expect success, `discount_total` matching the
   10% calculation, `promo_code: 'PLANTEST10'` (uppercased), and confirm via a follow-up `select`
   that the promotion's `uses_count` incremented by exactly 1.
5. Deactivate the promotion (`update public.promotions set is_active = false where code =
   'PLANTEST10'`), then call `create_order` again with the same code — expect the `'promo code is
   invalid or no longer available'` error, not a silent fallback to full price (this is the exact
   failure class the Variants module's final review found and fixed for variants — confirm
   Promotions doesn't repeat it).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20250101001100_promotions.sql src/lib/database.types.ts
git commit -m "feat(promotions): add promotions table, validate_promo_code RPC, and create_order promo support"
```

---

### Task 2: Admin promotion management (`PromotionsAdminPage`) + wiring

**Files:**
- Create: `src/modules/optional/promotions/useAdminPromotions.ts`
- Create: `src/modules/optional/promotions/useAdminPromotionMutations.ts`
- Create: `src/modules/optional/promotions/PromotionsAdminPage.tsx`
- Modify: `src/core/admin/AdminLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces (consumed by Task 5's E2E spec): default export `PromotionsAdminPage()` at
  `/admin/promotions`, rendering a "New promotion" button, a list of existing promotions each with
  an "Edit" button, and an inline form (fields `#promo-code`, `#promo-type` (select), `#promo-value`,
  `#promo-min-subtotal`, `#promo-max-uses`, `#promo-expires` (date input), an "Active" checkbox, and
  a "Save promotion" submit button) shown in place of the list while adding/editing.

- [ ] **Step 1: Write `useAdminPromotions.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useAdminPromotions() {
  return useQuery({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 2: Write `useAdminPromotionMutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type PromotionInsert = Database['public']['Tables']['promotions']['Insert']
type PromotionUpdate = Database['public']['Tables']['promotions']['Update']

export function useAdminPromotionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-promotions'] })

  const createPromotion = useMutation({
    mutationFn: async (input: PromotionInsert) => {
      const { error } = await supabase.from('promotions').insert(input)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updatePromotion = useMutation({
    mutationFn: async ({ id, ...input }: PromotionUpdate & { id: string }) => {
      const { error } = await supabase.from('promotions').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { createPromotion, updatePromotion }
}
```

- [ ] **Step 3: Write `PromotionsAdminPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { useAdminPromotions } from '@/modules/optional/promotions/useAdminPromotions'
import { useAdminPromotionMutations } from '@/modules/optional/promotions/useAdminPromotionMutations'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/lib/database.types'

type Promotion = Database['public']['Tables']['promotions']['Row']

interface PromotionFormInput {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_subtotal: number | null
  max_uses: number | null
  expires_at: string | null
  is_active: boolean
}

function emptyForm(initial?: Promotion): PromotionFormInput {
  return {
    code: initial?.code ?? '',
    discount_type: (initial?.discount_type as 'percent' | 'fixed' | undefined) ?? 'percent',
    discount_value: initial?.discount_value ?? 10,
    min_subtotal: initial?.min_subtotal ?? null,
    max_uses: initial?.max_uses ?? null,
    expires_at: initial?.expires_at ? initial.expires_at.slice(0, 10) : null,
    is_active: initial?.is_active ?? true,
  }
}

export default function PromotionsAdminPage() {
  const { data: promotions, isLoading, isError } = useAdminPromotions()
  const { createPromotion, updatePromotion } = useAdminPromotionMutations()
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const [form, setForm] = useState<PromotionFormInput>(emptyForm())
  const [error, setError] = useState<string | null>(null)

  function startEdit(promotion: Promotion | 'new') {
    setError(null)
    setForm(emptyForm(promotion === 'new' ? undefined : promotion))
    setEditing(promotion)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      ...form,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    }
    try {
      if (editing === 'new') {
        await createPromotion.mutateAsync(payload)
      } else if (editing) {
        await updatePromotion.mutateAsync({ id: editing.id, ...payload })
      }
      setEditing(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save promotion.'))
    }
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>
  if (isError) return <p className="p-8 text-destructive">Failed to load promotions.</p>

  if (editing) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-8">
        <h1 className="mb-6 text-2xl font-semibold">
          {editing === 'new' ? 'New promotion' : 'Edit promotion'}
        </h1>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-type">Type</Label>
              <select
                id="promo-type"
                value={form.discount_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))
                }
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-value">
                {form.discount_type === 'percent' ? 'Percent off' : 'Amount off (THB)'}
              </Label>
              <Input
                id="promo-value"
                type="number"
                min={0}
                step={form.discount_type === 'percent' ? 1 : 0.01}
                required
                value={form.discount_value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-min-subtotal">Minimum subtotal (THB, optional)</Label>
              <Input
                id="promo-min-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={form.min_subtotal ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    min_subtotal: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="promo-max-uses">Max uses (optional)</Label>
              <Input
                id="promo-max-uses"
                type="number"
                min={1}
                value={form.max_uses ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_uses: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="promo-expires">Expires (optional)</Label>
            <Input
              id="promo-expires"
              type="date"
              value={form.expires_at ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value || null }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={createPromotion.isPending || updatePromotion.isPending}>
              {createPromotion.isPending || updatePromotion.isPending
                ? 'Saving…'
                : 'Save promotion'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Promotions</h1>
        <Button size="sm" onClick={() => startEdit('new')}>
          New promotion
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {promotions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No promotions yet.</p>
        )}
        {promotions?.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {p.code}
                {!p.is_active && (
                  <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                )}
              </p>
              <p className="text-muted-foreground">
                {p.discount_type === 'percent'
                  ? `${p.discount_value}% off`
                  : `${formatPrice(p.discount_value)} off`}
                {' · '}Used {p.uses_count}
                {p.max_uses ? `/${p.max_uses}` : ''} times
                {p.expires_at && ` · Expires ${new Date(p.expires_at).toLocaleDateString()}`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Wire the nav link into `AdminLayout.tsx`**

The current file:

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
]

export function AdminLayout() {
  const location = useLocation()

  return (
    <div className="flex flex-col gap-6">
      <nav className="mx-auto flex w-full max-w-3xl gap-4 border-b px-4 pt-8 pb-2 text-sm">
        {NAV_ITEMS.map((item) => (
```

Change to:

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useFeature } from '@/lib/useFeature'

const BASE_NAV_ITEMS = [
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
]

export function AdminLayout() {
  const location = useLocation()
  const promotionsEnabled = useFeature('promotions')
  const navItems = promotionsEnabled
    ? [...BASE_NAV_ITEMS, { to: '/admin/promotions', label: 'Promotions' }]
    : BASE_NAV_ITEMS

  return (
    <div className="flex flex-col gap-6">
      <nav className="mx-auto flex w-full max-w-3xl gap-4 border-b px-4 pt-8 pb-2 text-sm">
        {navItems.map((item) => (
```

(Only the `.map` call's source array changes, from `NAV_ITEMS` to `navItems` — the rest of the
`<Link>` JSX inside the map is untouched.) This nav link needs no `<Feature>`/lazy wrapper — it's
just a plain string/URL, no optional-module code involved, so a `useFeature()` check alone is
sufficient and correct (`useFeature` is a core hook, `src/lib/useFeature.ts`).

- [ ] **Step 5: Add the route in `App.tsx`**

The current file's relevant imports:

```tsx
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { brandConfig } from '@/config/branding.config'
```

Add two imports:

```tsx
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { brandConfig } from '@/config/branding.config'
import { Feature } from '@/lib/Feature'
```

(Keep every other existing import line exactly as-is — insert these among them, don't reorder
unrelated imports.) Then, near the top of the file (module scope, alongside the other page
imports), add:

```tsx
const PromotionsAdminPage = lazy(() => import('@/modules/optional/promotions/PromotionsAdminPage'))
```

Then, inside the `/admin` route block, change:

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<AdminProductListPage />} />
            <Route path="categories" element={<AdminCategoryListPage />} />
            <Route path="orders" element={<AdminOrderListPage />} />
            <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
          </Route>
        </Route>
```

to:

```tsx
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<AdminProductListPage />} />
            <Route path="categories" element={<AdminCategoryListPage />} />
            <Route path="orders" element={<AdminOrderListPage />} />
            <Route path="orders/:orderId" element={<AdminOrderDetailPage />} />
            <Route
              path="promotions"
              element={
                <Feature flag="promotions">
                  <Suspense fallback={null}>
                    <PromotionsAdminPage />
                  </Suspense>
                </Feature>
              }
            />
          </Route>
        </Route>
```

- [ ] **Step 6: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass, `core/optional boundary OK` still printed, and the build output shows
`PromotionsAdminPage` as its own separate lazy chunk.

- [ ] **Step 7: Commit**

```bash
git add src/modules/optional/promotions/useAdminPromotions.ts \
  src/modules/optional/promotions/useAdminPromotionMutations.ts \
  src/modules/optional/promotions/PromotionsAdminPage.tsx \
  src/core/admin/AdminLayout.tsx src/App.tsx
git commit -m "feat(promotions): add admin PromotionsAdminPage and wire into nav/routes"
```

---

### Task 3: Customer promo code entry (`PromoCodeField`) + `CheckoutPage` wiring

**Files:**
- Create: `src/modules/optional/promotions/PromoCodeField.tsx`
- Modify: `src/core/checkout/CheckoutPage.tsx`

**Interfaces:**
- Produces: default export `PromoCodeField({ subtotal, applied, onApply, onRemove }: { subtotal:
  number; applied: AppliedPromo | null; onApply: (promo: AppliedPromo) => void; onRemove: () => void
  })` where `AppliedPromo = { code: string; discountType: 'percent' | 'fixed'; discountValue:
  number; discountAmount: number }`.

- [ ] **Step 1: Write `PromoCodeField.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface AppliedPromo {
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  discountAmount: number
}

export default function PromoCodeField({
  subtotal,
  applied,
  onApply,
  onRemove,
}: {
  subtotal: number
  applied: AppliedPromo | null
  onApply: (promo: AppliedPromo) => void
  onRemove: () => void
}) {
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApply() {
    setError(null)
    setChecking(true)
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        p_code: code,
        p_subtotal: subtotal,
      })
      if (error) throw error
      const result = data?.[0]
      if (!result || !result.valid) {
        setError(result?.reason ?? 'Invalid promo code.')
        return
      }
      onApply({
        code: code.toUpperCase(),
        discountType: result.discount_type as 'percent' | 'fixed',
        discountValue: result.discount_value ?? 0,
        discountAmount: result.discount_amount ?? 0,
      })
      setCode('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to check promo code.'))
    } finally {
      setChecking(false)
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>
          Code <span className="font-medium">{applied.code}</span> applied
        </span>
        <Button size="sm" variant="outline" onClick={onRemove}>
          Remove
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="Promo code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1"
        />
        <Button type="button" variant="outline" disabled={!code || checking} onClick={handleApply}>
          {checking ? 'Checking…' : 'Apply'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `CheckoutPage.tsx`**

The current file's imports:

```tsx
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { useAddresses } from '@/core/profile/useAddresses'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
```

Change to:

```tsx
import { lazy, Suspense, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useCartStore, useCartSubtotal } from '@/core/cart/cartStore'
import { useAddresses } from '@/core/profile/useAddresses'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/formatPrice'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { Button } from '@/components/ui/button'
import { Feature } from '@/lib/Feature'
import type { AppliedPromo } from '@/modules/optional/promotions/PromoCodeField'

const PromoCodeField = lazy(() => import('@/modules/optional/promotions/PromoCodeField'))
```

Note: importing only the `AppliedPromo` **type** from the module (via `import type`) does not
violate the core/optional boundary — TypeScript type-only imports are erased entirely at compile
time and never appear in the emitted JavaScript, so there is nothing for
`scripts/check-core-boundary.mjs` to even see at runtime; but its regex matches on the *source
text* of `from '...'` regardless of the `type` keyword, so confirm this specific line doesn't
trip a false positive by running `npm run lint` after this change — if it does, fall back to
declaring the shape inline in `CheckoutPage.tsx` instead of importing it (a small, acceptable
duplication) rather than fighting the linter.

Inside the component, change:

```tsx
  const effectiveAddressId = selectedAddressId ?? addresses?.[0]?.id

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_order', {
        p_items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        p_address_id: effectiveAddressId,
      })
      if (error) throw error
      return data
    },
```

to:

```tsx
  const effectiveAddressId = selectedAddressId ?? addresses?.[0]?.id
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null)

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_order', {
        p_items: items.map((item) => ({
          product_id: item.productId,
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        p_address_id: effectiveAddressId,
        p_promo_code: appliedPromo?.code ?? undefined,
      })
      if (error) throw error
      return data
    },
```

Then change the order-summary block:

```tsx
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Shipping is calculated when your order is placed and shown on the confirmation page.
        </p>
      </div>
```

to:

```tsx
        <div className="flex justify-between font-medium">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <Feature flag="promotions">
          <Suspense fallback={null}>
            <PromoCodeField
              subtotal={subtotal}
              applied={appliedPromo}
              onApply={setAppliedPromo}
              onRemove={() => setAppliedPromo(null)}
            />
          </Suspense>
        </Feature>
        {appliedPromo && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount</span>
            <span>-{formatPrice(appliedPromo.discountAmount)}</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Shipping is calculated when your order is placed and shown on the confirmation page.
        </p>
      </div>
```

- [ ] **Step 3: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass, `core/optional boundary OK` printed, `PromoCodeField` shown as its own lazy
chunk in the build output.

- [ ] **Step 4: Commit**

```bash
git add src/modules/optional/promotions/PromoCodeField.tsx src/core/checkout/CheckoutPage.tsx
git commit -m "feat(promotions): add customer PromoCodeField and wire into checkout"
```

---

### Task 4: Discount display in order detail pages

**Files:**
- Modify: `src/core/orders/OrderDetailPage.tsx`
- Modify: `src/core/admin/AdminOrderDetailPage.tsx`

**Interfaces:**
- Consumes: `order.discount_total`, `order.promo_code` (both already present in
  `database.types.ts` after Task 1's regeneration — no further schema/type work needed here).

- [ ] **Step 1: `OrderDetailPage.tsx`**

Change:

```tsx
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_fee)}</span>
        </div>
```

to:

```tsx
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.discount_total > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Discount{order.promo_code ? ` (${order.promo_code})` : ''}</span>
            <span>-{formatPrice(order.discount_total)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_fee)}</span>
        </div>
```

- [ ] **Step 2: `AdminOrderDetailPage.tsx`**

Apply the identical change (same before/after text) to this file's own subtotal/shipping block.

- [ ] **Step 3: Typecheck, lint, build**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/orders/OrderDetailPage.tsx src/core/admin/AdminOrderDetailPage.tsx
git commit -m "feat(promotions): show applied discount in order detail pages"
```

---

### Task 5: Verification (flag on locally to prove it, permanent flag-guarded E2E spec)

**Files:**
- Create: `e2e/promotions.spec.ts` (permanent — not deleted after this task)

**Interfaces:**
- Consumes: `e2e/helpers/auth.ts`'s `signUp`, `logIn`, `uniqueEmail`; `e2e/helpers/checkout.ts`'s
  `addAddress`; `brandConfig` from `src/config/branding.config.ts`.

- [ ] **Step 1: Temporarily enable the flag for local verification**

Edit `src/config/branding.config.ts`, changing `promotions: false` to `promotions: true`. **Do not
commit this change** — it's reverted in Step 4.

- [ ] **Step 2: Write `e2e/promotions.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { brandConfig } from '../src/config/branding.config'
import { signUp, logIn, uniqueEmail } from './helpers/auth'
import { addAddress } from './helpers/checkout'

test.skip(!brandConfig.features.promotions, 'promotions feature flag is off')

async function addFirstProductToCartAndReachCheckout(page: import('@playwright/test').Page) {
  await page.goto('/shop')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await page.goto('/cart')
  await page.getByRole('link', { name: 'Proceed to checkout' }).click()
}

test('promotions module: admin creates a code, customer applies it, discount flows through to order detail', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/promotions')
  await adminPage.getByRole('button', { name: 'New promotion' }).click()
  await adminPage.locator('#promo-code').fill('TESTSAVE10')
  await adminPage.locator('#promo-value').fill('10')
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()
  await expect(adminPage.getByText('TESTSAVE10')).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Promo Customer',
    email: uniqueEmail('promo-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Promo Customer',
    phone: '0891234567',
    line1: '1 Promo Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(customerPage)

  await customerPage.getByPlaceholder('Promo code').fill('testsave10')
  await customerPage.getByRole('button', { name: 'Apply' }).click()
  await expect(customerPage.getByText('Code TESTSAVE10 applied')).toBeVisible()
  await expect(customerPage.getByText('Discount')).toBeVisible()

  await customerPage.getByRole('button', { name: 'Place order' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)
  await expect(customerPage.getByText('Discount (TESTSAVE10)')).toBeVisible()

  await adminContext.close()
  await customerContext.close()
})

test('promotions module: an invalid code is rejected with a clear message', async ({ page }) => {
  await signUp(page, {
    fullName: 'Invalid Promo Customer',
    email: uniqueEmail('invalid-promo'),
    password: 'password123',
  })
  await addAddress(page, {
    recipientName: 'Invalid Promo Customer',
    phone: '0891234567',
    line1: '1 Invalid Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(page)

  await page.getByPlaceholder('Promo code').fill('NOSUCHCODE')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('code not found')).toBeVisible()
})

test('promotions module: a code deactivated after validation fails checkout instead of silently succeeding', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })
  await adminPage.goto('/admin/promotions')
  await adminPage.getByRole('button', { name: 'New promotion' }).click()
  await adminPage.locator('#promo-code').fill('RACETEST')
  await adminPage.locator('#promo-value').fill('20')
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Race Customer',
    email: uniqueEmail('race-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Race Customer',
    phone: '0891234567',
    line1: '1 Race Street',
    province: 'Bangkok',
    postalCode: '10110',
  })
  await addFirstProductToCartAndReachCheckout(customerPage)
  await customerPage.getByPlaceholder('Promo code').fill('RACETEST')
  await customerPage.getByRole('button', { name: 'Apply' }).click()
  await expect(customerPage.getByText('Code RACETEST applied')).toBeVisible()

  // Admin deactivates the code after the customer already validated it --
  // mirrors the exact deactivation-race class the Variants module's final
  // review found and fixed for variant selection.
  await adminPage.getByRole('button', { name: 'Edit' }).click()
  await adminPage.getByLabel('Active').uncheck()
  await adminPage.getByRole('button', { name: 'Save promotion' }).click()

  await customerPage.getByRole('button', { name: 'Place order' }).click()
  await expect(
    customerPage.getByText('promo code is invalid or no longer available'),
  ).toBeVisible()
  await expect(customerPage).toHaveURL('/checkout')

  await adminContext.close()
  await customerContext.close()
})
```

- [ ] **Step 3: Run it against a freshly-reset local stack**

```bash
supabase db reset
npm run test:e2e -- promotions.spec.ts
```

Expected: `3 passed`. If a locator doesn't match real rendered text/structure, fix it — and if a
test reveals a genuine bug in Tasks 1-4 rather than an imprecise assumption, fix the actual source
file (document what and why), don't paper over it in the test.

- [ ] **Step 4: Revert the flag and confirm bundle exclusion**

```bash
git checkout -- src/config/branding.config.ts
npm run build
grep -r "New promotion" dist/assets/index-*.js
grep -r "Code .* applied" dist/assets/index-*.js
```

Expected: neither grep finds a match in the main chunk (only, if anywhere, in the separate
`PromotionsAdminPage`/`PromoCodeField` lazy chunks).

- [ ] **Step 5: Full regression check**

```bash
npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Expected: all pass. `npm run test:e2e`'s reporter should show golden-path + security passing,
`reviews.spec.ts` and `variants.spec.ts` skipped as before, and `promotions.spec.ts`'s three tests
now showing as **skipped** (not run, not failed) under the committed `promotions: false` default.

- [ ] **Step 6: Commit**

```bash
git add e2e/promotions.spec.ts
git commit -m "test(promotions): add flag-guarded E2E spec for promotions module"
```
