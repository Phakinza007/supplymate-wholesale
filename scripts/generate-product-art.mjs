#!/usr/bin/env node
// Writes one SVG per product from src/demo/catalogue.data.json. Output is
// committed: the showcase is a static build with no image pipeline, and the
// Supabase seed points product_images at the same paths. Run with --check in
// lint so an edited catalogue can never ship without its art.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderProductArt } from './productArt.mjs'

const DATA_PATH = 'src/demo/catalogue.data.json'
const OUT_DIR = 'public/images/supplymate/products'
const check = process.argv.includes('--check')

const catalogue = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const expected = new Map(
  catalogue.products.map((product) => [
    `${product.slug}.svg`,
    renderProductArt({
      shape: product.art.shape,
      caption: product.art.caption,
      label: product.name,
      options: product.art.options ?? {},
    }),
  ]),
)

mkdirSync(OUT_DIR, { recursive: true })
const onDisk = readdirSync(OUT_DIR).filter((name) => name.endsWith('.svg'))
const problems = []

for (const [name, svg] of expected) {
  const path = join(OUT_DIR, name)
  const current = onDisk.includes(name) ? readFileSync(path, 'utf8') : null
  if (current === svg) continue

  if (check) {
    problems.push(current === null ? `missing ${name}` : `stale ${name}`)
  } else {
    writeFileSync(path, svg)
  }
}

// An orphan is reported in both modes and deleted in neither: removing files
// this script did not write is not its job. After renaming a slug, delete the
// old SVG by hand.
const orphans = onDisk.filter((name) => !expected.has(name))
for (const name of orphans) {
  console.warn(`orphan illustration (delete by hand): ${join(OUT_DIR, name)}`)
}
if (check) {
  problems.push(...orphans.map((name) => `orphan ${name}`))
}

if (check && problems.length > 0) {
  console.error(
    `${OUT_DIR} is out of date with ${DATA_PATH}:\n  ${problems.join('\n  ')}\n` +
      'Run `npm run generate:catalogue`.',
  )
  process.exit(1)
}

console.log(
  check
    ? `product art check OK (${expected.size} files)`
    : `wrote ${expected.size} product illustrations to ${OUT_DIR}`,
)
