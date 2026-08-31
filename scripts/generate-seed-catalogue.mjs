#!/usr/bin/env node
// The seed's catalogue is generated from src/demo/catalogue.data.json so the
// Supabase app and the static showcase cannot describe different products.
// Only the marked block is rewritten -- variants, addresses and the sample
// orders below it are hand-written and reference these product ids.
import { readFileSync, writeFileSync } from 'node:fs'

const DATA_PATH = 'src/demo/catalogue.data.json'
const SEED_PATH = 'supabase/seed.sql'
const BEGIN = '-- BEGIN generated catalogue -- npm run generate:catalogue -- do not edit by hand'
const END = '-- END generated catalogue'
const check = process.argv.includes('--check')

const catalogue = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const categoryId = new Map(catalogue.categories.map((category) => [category.slug, category.id]))
const text = (value) => `'${String(value).replace(/'/g, "''")}'`
const productImagePath = (slug) => `/images/supplymate/products/${slug}.svg`

for (const product of catalogue.products) {
  if (!categoryId.has(product.categorySlug)) {
    console.error(`${product.slug} names an unknown category: ${product.categorySlug}`)
    process.exit(1)
  }
}

const categoryRows = catalogue.categories
  .map(
    (category) =>
      `  (${text(category.id)}, ${text(category.slug)}, ${text(category.name)},\n` +
      `   ${text(category.description)}, ${text(category.imagePath)}, ${category.sortOrder})`,
  )
  .join(',\n')

const productRows = catalogue.products
  .map(
    (product) =>
      `  (${text(product.id)}, ${text(categoryId.get(product.categorySlug))},\n` +
      `   ${text(product.slug)}, ${text(product.name)},\n` +
      `   ${text(product.description)},\n` +
      `   ${product.price.toFixed(2)}, ${text(product.sku)}, ${product.stockQuantity}, ${product.hasVariants},` +
      ` 'active', ${product.sortOrder},\n` +
      `   ${text(product.packageUnit)}, ${product.unitsPerPackage}, ${product.minOrderQuantity})`,
  )
  .join(',\n')

const imageRows = catalogue.products
  .map(
    (product) =>
      `  (${text(product.id)}, ${text(productImagePath(product.slug))}, ${text(product.name)}, 0)`,
  )
  .join(',\n')

const block = `${BEGIN}
insert into public.categories (id, slug, name, description, image_path, sort_order) values
${categoryRows}
on conflict (id) do nothing;

-- Prices are per package. Every item has local owned imagery, available
-- stock, an explicit pack size, and a database-enforced order minimum.
-- status is written explicitly; is_active is derived by
-- trg_products_sync_is_active and must never be written here.
insert into public.products (
  id, category_id, slug, name, description, price, sku, stock_quantity,
  has_variants, status, sort_order, package_unit, units_per_package, min_order_quantity
) values
${productRows}
on conflict (id) do nothing;

insert into public.product_images (product_id, storage_path, alt, sort_order) values
${imageRows}
on conflict do nothing;
${END}`

const seed = readFileSync(SEED_PATH, 'utf8')
const start = seed.indexOf(BEGIN)
const stop = seed.indexOf(END)
if (start === -1 || stop === -1 || stop < start) {
  console.error(`${SEED_PATH} is missing the generated catalogue markers:\n  ${BEGIN}\n  ${END}`)
  process.exit(1)
}

const next = seed.slice(0, start) + block + seed.slice(stop + END.length)
if (next === seed) {
  console.log('seed catalogue check OK')
  process.exit(0)
}

if (check) {
  console.error(`${SEED_PATH} is out of date with ${DATA_PATH}. Run \`npm run generate:catalogue\`.`)
  process.exit(1)
}

writeFileSync(SEED_PATH, next)
console.log(`rewrote the generated catalogue block in ${SEED_PATH}`)
