#!/usr/bin/env node
// Writes one SVG per product from src/demo/catalogue.data.json. Output is
// committed: the showcase is a static build with no image pipeline, and the
// Supabase seed points product_images at the same paths. Run with --check in
// lint so an edited catalogue can never ship without its art.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHAPES, renderProductArt } from './productArt.mjs'

const DATA_PATH = 'src/demo/catalogue.data.json'
const OUT_DIR = 'public/images/supplymate/products'
const check = process.argv.includes('--check')

const catalogue = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

// Validate up front, in this script's own voice, rather than letting an
// unknown shape surface as renderProductArt()'s thrown stack trace -- same
// precedent as generate-seed-catalogue.mjs's unknown-category check.
for (const product of catalogue.products) {
  if (!SHAPES[product.art.shape]) {
    console.error(`${product.slug} names an unknown art shape: ${product.art.shape}`)
    process.exit(1)
  }
}

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

const problems = []

// --check must never mutate the tree, so only write mode creates OUT_DIR. A
// missing directory under --check is itself something to report, not a
// mkdirSync side effect or an uncaught readdirSync ENOENT.
if (!check) {
  mkdirSync(OUT_DIR, { recursive: true })
} else if (!existsSync(OUT_DIR)) {
  console.error(`${OUT_DIR} does not exist. Run \`npm run generate:catalogue\`.`)
  process.exit(1)
}

const onDisk = readdirSync(OUT_DIR).filter((name) => name.endsWith('.svg'))

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
// old SVG by hand -- re-running `npm run generate:catalogue` only writes the
// new file, it never removes the old one, so that advice does not apply here.
const orphans = onDisk.filter((name) => !expected.has(name))
for (const name of orphans) {
  console.warn(`orphan illustration (delete by hand): ${join(OUT_DIR, name)}`)
}

if (check && (problems.length > 0 || orphans.length > 0)) {
  const lines = []
  if (problems.length > 0) {
    lines.push(
      `${OUT_DIR} is out of date with ${DATA_PATH}:\n  ${problems.join('\n  ')}\n` +
        'Run `npm run generate:catalogue`.',
    )
  }
  if (orphans.length > 0) {
    lines.push(
      `${OUT_DIR} has orphaned illustration(s) that no product in ${DATA_PATH} refers to ` +
        'any more -- generate:catalogue never deletes, so these must be removed by hand:\n  ' +
        orphans.map((name) => join(OUT_DIR, name)).join('\n  '),
    )
  }
  console.error(lines.join('\n\n'))
  process.exit(1)
}

console.log(
  check
    ? `product art check OK (${expected.size} files)`
    : `wrote ${expected.size} product illustrations to ${OUT_DIR}`,
)
