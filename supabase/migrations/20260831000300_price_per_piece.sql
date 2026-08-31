-- Wholesale buyers compare suppliers on price per piece, not price per carton,
-- so the catalogue has to be sortable by it.
--
-- This has to be a column, not a client-side calculation: /shop paginates
-- server-side, so sorting the fetched page would only reorder the twelve rows
-- already in hand and silently lie about being "cheapest first". Generated and
-- stored so it can carry an index, and so it can never drift from price /
-- units_per_package the way a trigger-maintained copy could.
--
-- `nullif` guards a zero divisor. units_per_package is `not null check (>= 1)`
-- today, so this is belt-and-braces rather than a live case -- but a generated
-- column that can raise on write would block the insert entirely.
alter table public.products
  add column price_per_piece numeric(14,4)
    generated always as (price / nullif(units_per_package, 0)) stored;

-- Partial on is_active: the storefront is the only thing that sorts by this,
-- and it never looks at draft or archived rows.
create index products_price_per_piece_idx
  on public.products (price_per_piece)
  where is_active;
