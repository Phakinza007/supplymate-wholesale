# Volume Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin set quantity price breaks on a product, so a customer ordering more cartons pays less per carton.

**Architecture:** A new `product_price_tiers` table holds `(product_id, min_quantity, unit_price)` rows. `create_order()` resolves the applicable tier itself, server-side, under the product row lock it already takes — the browser never sends a price. A pure `resolveTierPrice()` helper expresses the same rule once on the client for display, used by the product page and by the cart, which pushes the resolved price back into the cart store so the existing subtotal and checkout totals stay correct without learning about tiers.

**Tech Stack:** Postgres (Supabase migrations, plpgsql), React 19 + TypeScript, TanStack Query, Zustand, Vitest (pure modules only), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-admin-product-management-design.md`

## Global Constraints

- All money renders through `formatPrice()` (`src/lib/formatPrice.ts`); never `toLocaleString()` directly.
- All mutation errors render through `getErrorMessage(err, fallback)` (`src/lib/getErrorMessage.ts`).
- Checkout is `supabase.rpc('create_order', {...})`. There is no INSERT policy on `orders`/`order_items` by design. A client-side price is never trusted; the RPC re-reads and re-resolves every price itself.
- Any client-side validation is UX only — the mutating RPC must independently re-verify the same condition (CLAUDE.md's standing rule from Variants and Promotions).
- Price precedence, highest first: `product_variants.price_override` → matching tier → `products.price`.
- New tables must `enable row level security` explicitly. Table privileges are already covered by `alter default privileges for role postgres` in `20250101000800_public_table_grants.sql`, so a new table that forgets RLS fails **open**.
- `src/lib/database.types.ts` must retain its `__InternalSupabase: { PostgrestVersion: "14.15" }` block; `npm run lint` fails without it.
- Volume pricing is **core, not an optional module** — no feature flag, no `<Feature>` wrapper, and its E2E spec runs unconditionally.
- Vitest has no jsdom or React Testing Library. Unit tests target pure modules only.
- This plan adds exactly one migration, `20260831000200_product_price_tiers.sql`.

---

### Task 1: Price tier table, rules trigger, and tier-aware `create_order()`

**Files:**
- Create: `supabase/migrations/20260831000200_product_price_tiers.sql`
- Modify: `src/lib/database.types.ts` (add the `product_price_tiers` table block)

**Interfaces:**
- Consumes: `public.products`, `public.product_variants`, `public.create_order(jsonb, uuid, jsonb, text, text, jsonb)` as it exists after `20260807000100_supplymate_wholesale.sql`.
- Produces: table `public.product_price_tiers`; trigger `trg_price_tiers_rules`; a replaced `create_order()` with the same signature and an added tier lookup. TypeScript sees `Database['public']['Tables']['product_price_tiers']`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260831000200_product_price_tiers.sql`:

```sql
-- Wholesale quantity price breaks. The applicable tier is the one with the
-- highest min_quantity that is still <= the quantity ordered; with no
-- qualifying tier, products.price applies.
create table public.product_price_tiers (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  min_quantity integer not null check (min_quantity >= 1),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  created_at   timestamptz not null default now(),
  unique (product_id, min_quantity)
);
create index product_price_tiers_product_idx
  on public.product_price_tiers (product_id, min_quantity);

-- Two rules that need a cross-row or cross-table read, so they can't be
-- plain CHECK constraints. Both mirror Shopify B2B's documented behaviour.
create or replace function public.enforce_price_tier_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_min_order integer;
  v_count     integer;
begin
  select min_order_quantity into v_min_order
    from public.products where id = new.product_id;
  if v_min_order is null then
    raise exception 'product not found' using errcode = '23503';
  end if;

  -- A tier at or below the MOQ is unreachable: every order already starts
  -- at the MOQ, so such a tier would silently replace the base price.
  if new.min_quantity <= v_min_order then
    raise exception
      'price tier quantity (%) must be greater than the product minimum order quantity (%)',
      new.min_quantity, v_min_order using errcode = '22023';
  end if;

  select count(*) into v_count
    from public.product_price_tiers
   where product_id = new.product_id
     and id is distinct from new.id;
  if v_count >= 10 then
    raise exception 'a product can have at most 10 price tiers' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_price_tiers_rules
  before insert or update on public.product_price_tiers
  for each row execute function public.enforce_price_tier_rules();

alter table public.product_price_tiers enable row level security;

create policy "product_price_tiers: public read" on public.product_price_tiers
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy "product_price_tiers: admin write" on public.product_price_tiers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Replace create_order() so the tier is resolved SERVER-SIDE. Same signature
-- as 20260807000100_supplymate_wholesale.sql; the only change is the
-- unit_price expression in the _cart temp table. The client still sends only
-- {product_id, variant_id, quantity}, so a tampered cart cannot express a
-- price -- and a variant price_override still wins over any product-level
-- tier, because an override is an explicit per-variant price.
create or replace function public.create_order(
  p_items            jsonb,
  p_address_id       uuid    default null,
  p_shipping_address jsonb   default null,
  p_note             text    default null,
  p_promo_code       text    default null,
  p_business_details jsonb   default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_addr          public.addresses%rowtype;
  v_ship          jsonb;
  v_name          text;
  v_phone         text;
  v_business_name text;
  v_tax_id        text;
  v_branch_name   text;
  v_subtotal      numeric(12,2);
  v_shipping      numeric(12,2);
  v_discount      numeric(12,2) := 0;
  v_promo         public.promotions%rowtype;
  v_order         public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty' using errcode = '22023';
  end if;
  if p_business_details is not null and jsonb_typeof(p_business_details) <> 'object' then
    raise exception 'business details must be a JSON object' using errcode = '22023';
  end if;

  v_business_name := nullif(trim(p_business_details->>'business_name'), '');
  v_tax_id        := nullif(trim(p_business_details->>'tax_id'), '');
  v_branch_name   := nullif(trim(p_business_details->>'branch_name'), '');

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
    coalesce(
      v.price_override,
      (select t.unit_price
         from public.product_price_tiers t
        where t.product_id = p.id
          and t.min_quantity <= i.quantity
        order by t.min_quantity desc
        limit 1),
      p.price
    )::numeric(12,2)                              as unit_price,
    i.quantity
  from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity integer)
  join public.products p on p.id = i.product_id and p.is_active
  left join public.product_variants v
         on v.id = i.variant_id and v.product_id = p.id and v.is_active
  where i.quantity >= p.min_order_quantity
    and (i.variant_id is null or v.id is not null)
  for no key update of p;

  if (select count(*) from _cart) <> jsonb_array_length(p_items) then
    raise exception 'one or more items are unavailable' using errcode = '22023';
  end if;
  -- stock-automation module hooks in here: check + decrement stock_quantity.

  select coalesce(sum(round(unit_price * quantity, 2)), 0) into v_subtotal from _cart;
  v_shipping := public.calc_shipping_fee(v_subtotal);

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

    v_discount := least(
      case
        when v_promo.discount_type = 'percent' then round(v_subtotal * v_promo.discount_value / 100, 2)
        else v_promo.discount_value
      end,
      v_subtotal
    );

    update public.promotions set uses_count = uses_count + 1 where id = v_promo.id;
  end if;

  insert into public.orders (
    user_id, address_id, shipping_address, customer_name, customer_phone, customer_email,
    customer_note, subtotal, discount_total, shipping_fee, total, promo_code,
    business_name, tax_id, branch_name
  ) values (
    v_uid, p_address_id, v_ship, v_name, v_phone,
    (select email from public.profiles where id = v_uid),
    p_note, v_subtotal, v_discount, v_shipping, v_subtotal - v_discount + v_shipping,
    case when p_promo_code is not null then upper(p_promo_code) else null end,
    v_business_name, v_tax_id, v_branch_name
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

revoke execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb)
  from public, anon;
grant execute on function public.create_order(jsonb, uuid, jsonb, text, text, jsonb)
  to authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db reset --yes`
Expected: completes with no error. A syntax error in the replaced `create_order()` fails here, not later.

- [ ] **Step 3: Add the table to the generated database types**

Hand-edit `src/lib/database.types.ts` — CLAUDE.md records that the installed CLI drops the `__InternalSupabase` block unpredictably.

Insert this block immediately **before** the existing `      product_variants: {` line, matching the surrounding format exactly:

```ts
      product_price_tiers: {
        Row: {
          created_at: string
          id: string
          min_quantity: number
          product_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          min_quantity: number
          product_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          min_quantity?: number
          product_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS, including `database.types.ts __InternalSupabase check OK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831000200_product_price_tiers.sql src/lib/database.types.ts
git commit -m "feat: add product price tiers and resolve them inside create_order"
```

---

### Task 2: `resolveTierPrice` pure helper

**Files:**
- Create: `src/lib/priceTiers.ts`
- Create: `src/lib/priceTiers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PriceTier { min_quantity: number; unit_price: number }`
  - `resolveTierPrice(basePrice: number, tiers: PriceTier[], quantity: number): number`
  - `sortTiers(tiers: PriceTier[]): PriceTier[]` — ascending by `min_quantity`, non-mutating

- [ ] **Step 1: Write the failing tests**

Create `src/lib/priceTiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveTierPrice, sortTiers, type PriceTier } from './priceTiers'

const tiers: PriceTier[] = [
  { min_quantity: 50, unit_price: 1100 },
  { min_quantity: 10, unit_price: 1200 },
]

describe('resolveTierPrice', () => {
  it('returns the base price below every tier', () => {
    expect(resolveTierPrice(1290, tiers, 9)).toBe(1290)
  })

  it('returns the base price when there are no tiers', () => {
    expect(resolveTierPrice(1290, [], 500)).toBe(1290)
  })

  it('applies a tier exactly at its threshold', () => {
    expect(resolveTierPrice(1290, tiers, 10)).toBe(1200)
  })

  it('keeps the lower tier between thresholds', () => {
    expect(resolveTierPrice(1290, tiers, 49)).toBe(1200)
  })

  it('picks the highest qualifying tier, not the first match', () => {
    expect(resolveTierPrice(1290, tiers, 50)).toBe(1100)
    expect(resolveTierPrice(1290, tiers, 999)).toBe(1100)
  })
})

describe('sortTiers', () => {
  it('sorts ascending by min_quantity', () => {
    expect(sortTiers(tiers).map((t) => t.min_quantity)).toEqual([10, 50])
  })

  it('does not mutate its input', () => {
    const input = [...tiers]
    sortTiers(input)
    expect(input.map((t) => t.min_quantity)).toEqual([50, 10])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./priceTiers"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/priceTiers.ts`:

```ts
// The single place the tier rule is expressed on the client. It is display
// only -- create_order() resolves the price again server-side and always
// wins, per this project's standing rule that a client-side check is never
// trusted by the mutating RPC.
export interface PriceTier {
  min_quantity: number
  unit_price: number
}

export function sortTiers<T extends PriceTier>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
}

// The applicable tier is the one with the highest min_quantity still <= the
// quantity ordered. With none qualifying, the product's base price applies.
export function resolveTierPrice(
  basePrice: number,
  tiers: PriceTier[],
  quantity: number,
): number {
  let best: PriceTier | null = null
  for (const tier of tiers) {
    if (tier.min_quantity <= quantity && (!best || tier.min_quantity > best.min_quantity)) {
      best = tier
    }
  }
  return best ? Number(best.unit_price) : basePrice
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceTiers.ts src/lib/priceTiers.test.ts
git commit -m "feat: add resolveTierPrice helper"
```

---

### Task 3: Cart store learns to accept a re-resolved price

**Files:**
- Modify: `src/core/cart/cartStore.ts`
- Modify: `src/core/cart/cartStore.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useCartStore().reconcilePricing(productId: string, variantId: string | null, unitPrice: number): void`, added to the `CartState` interface. `useCartSubtotal()` is unchanged and picks up the new prices for free.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/cart/cartStore.test.ts`:

```ts
describe('reconcilePricing', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('replaces the cached unit price on the matching line only', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().addItem({ ...line, productId: 'other', productSlug: 'other' }, 3)

    useCartStore.getState().reconcilePricing(line.productId, null, 1200)

    const items = useCartStore.getState().items
    expect(items.find((i) => i.productId === line.productId)?.unitPrice).toBe(1200)
    expect(items.find((i) => i.productId === 'other')?.unitPrice).toBe(1290)
  })

  it('feeds the recomputed subtotal', () => {
    useCartStore.getState().addItem(line, 10)
    useCartStore.getState().reconcilePricing(line.productId, null, 1200)

    const subtotal = useCartStore
      .getState()
      .items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    expect(subtotal).toBe(12_000)
  })

  it('ignores a line that is not in the cart', () => {
    useCartStore.getState().addItem(line, 3)
    useCartStore.getState().reconcilePricing('not-in-cart', null, 1)
    expect(useCartStore.getState().items[0]?.unitPrice).toBe(1290)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `useCartStore.getState().reconcilePricing is not a function`.

- [ ] **Step 3: Add the action**

In `src/core/cart/cartStore.ts`, add to the `CartState` interface, immediately after the `reconcileWholesale` signature:

```ts
  reconcilePricing: (productId: string, variantId: string | null, unitPrice: number) => void
```

And add the implementation immediately after the `reconcileWholesale` implementation, before `clear`:

```ts
  // The cart caches a price at add-to-cart time for display. Once the cart
  // page has the product's live tiers it re-resolves the line price and
  // pushes it back here, so useCartSubtotal() and the checkout total stay
  // truthful. create_order() still re-prices everything server-side; this
  // only keeps the number the customer is shown from drifting.
  reconcilePricing: (productId, variantId, unitPrice) =>
    set((state) => ({
      items: state.items.map((item) =>
        sameLine(item, { productId, variantId }) ? { ...item, unitPrice } : item,
      ),
    })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/cart/cartStore.ts src/core/cart/cartStore.test.ts
git commit -m "feat: add reconcilePricing action to the cart store"
```

---

### Task 4: Fetch tiers with the product

**Files:**
- Modify: `src/core/catalog/useProduct.ts`

**Interfaces:**
- Consumes: `product_price_tiers` from Task 1.
- Produces: `useProduct(slug).data.product_price_tiers` — an array of `{ id, product_id, min_quantity, unit_price, created_at }`, available to both `ProductDetailPage` and `CartPage`, which already call this hook.

- [ ] **Step 1: Add the embedded select**

In `src/core/catalog/useProduct.ts`, replace:

```ts
        .select('*, product_images(*), categories(name, slug)')
```

with:

```ts
        .select('*, product_images(*), product_price_tiers(*), categories(name, slug)')
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS. The embedded relation is typed from the `Relationships` block added in Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/core/catalog/useProduct.ts
git commit -m "feat: fetch price tiers alongside the product"
```

---

### Task 5: Tier pricing on the product detail page

**Files:**
- Modify: `src/core/catalog/ProductDetailPage.tsx`

**Interfaces:**
- Consumes: `resolveTierPrice`, `sortTiers` from `@/lib/priceTiers`; `useProduct(...).data.product_price_tiers` from Task 4.
- Produces: no exported API change.

- [ ] **Step 1: Import the helper**

Add to the import block in `src/core/catalog/ProductDetailPage.tsx`:

```ts
import { resolveTierPrice, sortTiers } from '@/lib/priceTiers'
```

- [ ] **Step 2: Compute the effective price**

Immediately after the existing `const maxQuantity = ...` line, add:

```ts
  const tiers = sortTiers(product.product_price_tiers ?? [])
  // A variant price_override is an explicit per-variant price and is never
  // undercut by a product-level tier.
  const effectiveUnitPrice =
    selectedVariant?.price_override ?? resolveTierPrice(Number(product.price), tiers, quantity)
  const tierApplied = effectiveUnitPrice < Number(product.price)
```

- [ ] **Step 3: Show the effective price in the headline**

Replace:

```tsx
            <span className="text-xl">
              {formatPrice(selectedVariant?.price_override ?? Number(product.price))} /{' '}
              {quantityLabel(packageUnit, 1)}
            </span>
```

with:

```tsx
            <span className="text-xl">
              {formatPrice(effectiveUnitPrice)} / {quantityLabel(packageUnit, 1)}
            </span>
            {tierApplied && (
              <span className="text-muted-foreground line-through">
                {formatPrice(Number(product.price))}
              </span>
            )}
```

- [ ] **Step 4: Render the tier table**

Immediately after the closing `</div>` of the existing wholesale info box (the one containing `สั่งขั้นต่ำ`), add:

```tsx
          {tiers.length > 0 && (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-2 font-medium">ราคาขายส่งตามจำนวน</p>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1">{quantityLabel(packageUnit, minimumQuantity)} ขึ้นไป</td>
                    <td className="py-1 text-right">{formatPrice(Number(product.price))}</td>
                  </tr>
                  {tiers.map((tier) => (
                    <tr
                      key={tier.id}
                      className={
                        'border-b last:border-0 ' +
                        (effectiveUnitPrice === Number(tier.unit_price) ? 'font-medium' : '')
                      }
                    >
                      <td className="py-1">
                        {quantityLabel(packageUnit, tier.min_quantity)} ขึ้นไป
                      </td>
                      <td className="py-1 text-right">{formatPrice(Number(tier.unit_price))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                ราคาต่อหน่วยจะปรับอัตโนมัติตามจำนวนที่สั่ง
              </p>
            </div>
          )}
```

- [ ] **Step 5: Add to cart at the effective price**

In the `addItem({...})` call, replace:

```tsx
                    unitPrice: selectedVariant?.price_override ?? Number(product.price),
```

with:

```tsx
                    unitPrice: effectiveUnitPrice,
```

- [ ] **Step 6: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/catalog/ProductDetailPage.tsx
git commit -m "feat: show and apply quantity price breaks on the product page"
```

---

### Task 6: Tier pricing in the cart

**Files:**
- Modify: `src/core/cart/CartPage.tsx`

**Interfaces:**
- Consumes: `resolveTierPrice` from `@/lib/priceTiers`; `reconcilePricing` from the cart store (Task 3); `product.product_price_tiers` from Task 4.
- Produces: no exported API change. `useCartSubtotal()` and `CheckoutPage`'s displayed total become tier-correct without either file changing.

- [ ] **Step 1: Import the helper**

Add to the import block in `src/core/cart/CartPage.tsx`:

```ts
import { resolveTierPrice } from '@/lib/priceTiers'
```

- [ ] **Step 2: Pull the new store action into `CartLineItem`**

Immediately after the existing `const reconcileWholesale = useCartStore((state) => state.reconcileWholesale)` line, add:

```ts
  const reconcilePricing = useCartStore((state) => state.reconcilePricing)
```

- [ ] **Step 3: Resolve the live line price**

Immediately after the existing `const status: LineStatus = ...` block, add:

```ts
  // A variant line keeps its stored price: this page does not fetch variants,
  // and a variant price_override outranks any product-level tier anyway.
  const resolvedUnitPrice =
    product && !item.variantId
      ? resolveTierPrice(Number(product.price), product.product_price_tiers ?? [], item.quantity)
      : null
```

- [ ] **Step 4: Push it back into the store**

Immediately after the existing `useEffect` that calls `reconcileWholesale`, add:

```ts
  useEffect(() => {
    if (resolvedUnitPrice !== null && resolvedUnitPrice !== item.unitPrice) {
      reconcilePricing(item.productId, item.variantId, resolvedUnitPrice)
    }
  }, [item, reconcilePricing, resolvedUnitPrice])
```

- [ ] **Step 5: Tell the customer a break was applied**

Replace:

```tsx
        <span className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} each</span>
```

with:

```tsx
        <span className="text-sm text-muted-foreground">
          {formatPrice(item.unitPrice)} each
          {product && item.unitPrice < Number(product.price) && (
            <span className="ml-2 text-foreground">· ราคาขายส่งตามจำนวน</span>
          )}
        </span>
```

- [ ] **Step 6: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/cart/CartPage.tsx
git commit -m "feat: apply quantity price breaks to cart lines and the subtotal"
```

---

### Task 7: Admin price tier panel

**Files:**
- Create: `src/core/admin/useProductPriceTiers.ts`
- Create: `src/core/admin/ProductPriceTiersPanel.tsx`
- Modify: `src/core/admin/AdminProductListPage.tsx`

**Interfaces:**
- Consumes: `product_price_tiers` from Task 1; `getErrorMessage`, `formatPrice`.
- Produces:
  - `useProductPriceTiers(productId: string)` — TanStack query, key `['admin-price-tiers', productId]`, returns rows ordered by `min_quantity`.
  - `useProductPriceTierMutations(productId: string)` — `{ addTier, deleteTier }`.
  - `<ProductPriceTiersPanel productId={string} />`, rendered next to `<ProductImagesPanel />`.

- [ ] **Step 1: Write the query and mutations hook**

Create `src/core/admin/useProductPriceTiers.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProductPriceTiers(productId: string) {
  return useQuery({
    queryKey: ['admin-price-tiers', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_price_tiers')
        .select('*')
        .eq('product_id', productId)
        .order('min_quantity', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useProductPriceTierMutations(productId: string) {
  const queryClient = useQueryClient()
  // The storefront reads tiers through useProduct's embedded select, so its
  // cache has to be invalidated too or an admin edit won't show up there.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-price-tiers', productId] })
    queryClient.invalidateQueries({ queryKey: ['product'] })
  }

  const addTier = useMutation({
    mutationFn: async (input: { min_quantity: number; unit_price: number }) => {
      const { error } = await supabase
        .from('product_price_tiers')
        .insert({ product_id: productId, ...input })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_price_tiers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { addTier, deleteTier }
}
```

Note this is the one place in `src/core/admin/` with a real delete. That is correct and does not contradict the "deactivate, never delete" rule, which is about products and categories — a price tier is a rule, not a record with order history hanging off it.

- [ ] **Step 2: Write the panel**

Create `src/core/admin/ProductPriceTiersPanel.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import {
  useProductPriceTiers,
  useProductPriceTierMutations,
} from '@/core/admin/useProductPriceTiers'
import { getErrorMessage } from '@/lib/getErrorMessage'
import { formatPrice } from '@/lib/formatPrice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MAX_TIERS = 10

export function ProductPriceTiersPanel({ productId }: { productId: string }) {
  const { data: tiers, isLoading, isError } = useProductPriceTiers(productId)
  const { addTier, deleteTier } = useProductPriceTierMutations(productId)
  const [minQuantity, setMinQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addTier.mutateAsync({
        min_quantity: Number(minQuantity),
        unit_price: Number(unitPrice),
      })
      setMinQuantity('')
      setUnitPrice('')
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add price tier.'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">ราคาขายส่งตามจำนวน</h2>
      <p className="text-xs text-muted-foreground">
        จำนวนขั้นต่ำของแต่ละขั้นต้องมากกว่า "ขั้นต่ำต่อรายการ" ของสินค้า และมีได้สูงสุด {MAX_TIERS} ขั้น
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Failed to load price tiers.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {tiers && tiers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tiers.map((tier) => (
            <li
              key={tier.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <span>
                ตั้งแต่ {tier.min_quantity} ขึ้นไป · {formatPrice(Number(tier.unit_price))}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={deleteTier.isPending}
                onClick={() =>
                  deleteTier.mutate(tier.id, {
                    onError: (err) => setError(getErrorMessage(err, 'Failed to delete price tier.')),
                  })
                }
              >
                ลบ
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tier_min_quantity">ตั้งแต่จำนวน</Label>
          <Input
            id="tier_min_quantity"
            type="number"
            min={1}
            required
            className="w-28"
            value={minQuantity}
            onChange={(e) => setMinQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tier_unit_price">ราคาต่อหน่วย</Label>
          <Input
            id="tier_unit_price"
            type="number"
            min={0}
            step="0.01"
            required
            className="w-32"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={addTier.isPending || (tiers?.length ?? 0) >= MAX_TIERS}
        >
          เพิ่มขั้นราคา
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Mount the panel in the admin product editor**

In `src/core/admin/AdminProductListPage.tsx`, add to the import block:

```ts
import { ProductPriceTiersPanel } from '@/core/admin/ProductPriceTiersPanel'
```

and immediately after the existing `{editing !== 'new' && <ProductImagesPanel productId={editing.id} />}` line, add:

```tsx
        {editing !== 'new' && <ProductPriceTiersPanel productId={editing.id} />}
```

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/admin/useProductPriceTiers.ts src/core/admin/ProductPriceTiersPanel.tsx src/core/admin/AdminProductListPage.tsx
git commit -m "feat: add admin price tier panel"
```

---

### Task 8: End-to-end coverage

**Files:**
- Create: `e2e/volume-pricing.spec.ts`

**Interfaces:**
- Consumes: `logIn`, `signUp`, `uniqueEmail` from `./helpers/auth`; `addAddress`, `fillBusinessDetails` from `./helpers/checkout`; the seeded `admin@example.com` / `password123` account.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing spec**

This spec must prove the two things that matter: the trigger rejects an unreachable tier, and the **order actually records the tier price** — the display could be right while `create_order()` silently charged the base price.

Create `e2e/volume-pricing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { logIn, signUp, uniqueEmail } from './helpers/auth'
import { addAddress, fillBusinessDetails } from './helpers/checkout'

test('quantity price breaks are shown, enforced by the trigger, and charged by create_order', async ({
  browser,
}) => {
  const suffix = `${Date.now()}`
  const name = `Tier Probe ${suffix}`
  const slug = `tier-probe-${suffix}`

  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await logIn(adminPage, { email: 'admin@example.com', password: 'password123' })

  await adminPage.goto('/admin/products')
  await adminPage.getByRole('button', { name: 'New product' }).click()
  await adminPage.locator('#name').fill(name)
  await adminPage.locator('#slug').fill(slug)
  await adminPage.locator('#price').fill('1000')
  await adminPage.locator('#min_order_quantity').fill('2')
  await adminPage.locator('#stock_quantity').fill('500')
  await adminPage.locator('#status').selectOption('active')
  await adminPage.getByRole('button', { name: 'Save product' }).click()
  await expect(adminPage.getByRole('heading', { name: 'Edit product' })).toBeVisible()

  // A tier at or below the MOQ is unreachable; the DB trigger refuses it.
  await adminPage.locator('#tier_min_quantity').fill('2')
  await adminPage.locator('#tier_unit_price').fill('900')
  await adminPage.getByRole('button', { name: 'เพิ่มขั้นราคา' }).click()
  await expect(adminPage.getByText(/must be greater than the product minimum order quantity/)).toBeVisible()

  // A reachable tier is accepted.
  await adminPage.locator('#tier_min_quantity').fill('10')
  await adminPage.locator('#tier_unit_price').fill('900')
  await adminPage.getByRole('button', { name: 'เพิ่มขั้นราคา' }).click()
  await expect(adminPage.getByText('ตั้งแต่ 10 ขึ้นไป · ฿900.00')).toBeVisible()

  const customerContext = await browser.newContext()
  const customerPage = await customerContext.newPage()
  await signUp(customerPage, {
    fullName: 'Tier Probe Customer',
    email: uniqueEmail('tier-customer'),
    password: 'password123',
  })
  await addAddress(customerPage, {
    recipientName: 'Tier Probe Customer',
    phone: '0891234567',
    line1: '1 Tier Street',
    province: 'Bangkok',
    postalCode: '10110',
  })

  await customerPage.goto(`/products/${slug}`)
  // Below the tier: base price.
  await expect(customerPage.getByText('฿1,000.00 / 1 ลัง')).toBeVisible()
  // At the tier: the headline price drops as the quantity input changes.
  await customerPage.getByLabel('จำนวนที่สั่งซื้อ').fill('10')
  await expect(customerPage.getByText('฿900.00 / 1 ลัง')).toBeVisible()

  await customerPage.getByRole('button', { name: 'Add to cart' }).click()
  await customerPage.getByText('Added ✓').waitFor()

  await customerPage.goto('/cart')
  await expect(customerPage.getByText('฿900.00 each')).toBeVisible()
  await expect(customerPage.getByText('฿9,000.00').first()).toBeVisible()

  await customerPage.getByRole('link', { name: 'Proceed to checkout' }).click()
  await fillBusinessDetails(customerPage, 'Tier Probe Co')
  await customerPage.getByRole('button', { name: 'Place order' }).click()
  await customerPage.waitForURL(/\/orders\/.+/)

  // The order the server actually created must carry the tier price, not the
  // base price the client happened to display.
  await expect(customerPage.getByText('฿9,000.00').first()).toBeVisible()
  await expect(customerPage.getByText('฿10,000.00')).toHaveCount(0)

  await customerContext.close()
  await adminContext.close()
})
```

- [ ] **Step 2: Run the spec to verify it passes**

Run: `npm run test:e2e -- e2e/volume-pricing.spec.ts`
Expected: PASS.

If a price assertion fails on formatting, check `brandConfig.currencySymbol` and adjust the expected strings to match `formatPrice()`'s real output — do not weaken the assertions to substring matches on the number alone.

- [ ] **Step 3: Run the full suite**

Run: `npm run test:e2e`
Expected: PASS, all specs. The golden path buys the first product on `/shop`; confirm the probe product has not displaced what it expects.

- [ ] **Step 4: Commit**

```bash
git add e2e/volume-pricing.spec.ts
git commit -m "test: cover volume pricing end to end"
```

---

### Task 9: Document the volume pricing conventions

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the written convention future contributors follow.

- [ ] **Step 1: Add a Volume pricing section to CLAUDE.md**

Insert a new section immediately **before** the existing `## Cart, checkout, payment slip` section:

```markdown
## Volume pricing

- `product_price_tiers` (`supabase/migrations/20260831000200_product_price_tiers.sql`) holds
  wholesale quantity breaks as `(product_id, min_quantity, unit_price)`. The applicable tier is the
  one with the **highest `min_quantity` still `<= quantity ordered`**; with none qualifying,
  `products.price` applies. Precedence, highest first: `product_variants.price_override` →
  matching tier → `products.price`.
- **This is core, not an optional module** — there is no feature flag and no `<Feature>` wrapper. A
  wholesale kit that cannot express a quantity break is not a wholesale kit. Its E2E spec
  (`e2e/volume-pricing.spec.ts`) therefore runs unconditionally, unlike the flag-guarded
  `test.skip(!brandConfig.features.x, ...)` specs the Phase 2 modules ship.
- `create_order()` resolves the tier **itself**, inside its `_cart` temp table, under the same
  `for no key update` product lock it already held. `resolveTierPrice()` (`src/lib/priceTiers.ts`)
  expresses the same rule on the client for display only — the standing rule from Variants and
  Promotions applies unchanged: the mutating RPC never trusts a client-side price.
- Two rules live in the `enforce_price_tier_rules` trigger rather than in CHECK constraints,
  because both need a cross-row or cross-table read: **at most 10 tiers per product** (Shopify's
  documented limit) and **`min_quantity > products.min_order_quantity`** (a tier at or below the
  MOQ is unreachable, since every order already starts at the MOQ).
- `CartPage` re-resolves each line's price from the live tiers `useProduct()` already fetches and
  pushes the result into the cart store via **`reconcilePricing`**. That is what keeps
  `useCartSubtotal()` and `CheckoutPage`'s total truthful without either file knowing tiers exist.
  A variant line is skipped — the cart page does not fetch variants, and an override outranks a
  tier anyway.
- `ProductListPage` deliberately still shows the base price. Tier pricing is a detail-page concern,
  matching how Shopify's collection pages behave.
- `useProductPriceTierMutations` **deletes** tiers outright. That does not contradict the
  "deactivate, never delete" rule in the Admin section — that rule is about products and
  categories, which have order history hanging off them. A price tier is a rule, not a record.
```

- [ ] **Step 2: Verify everything is still green**

Run: `npm run lint && npm run typecheck && npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record volume pricing conventions"
```
