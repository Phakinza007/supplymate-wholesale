#!/usr/bin/env node
// Fails if a step in the product tour points at a `data-tour` anchor that no
// longer exists in src/.
//
// This lives here rather than in a vitest file because it needs node's fs, and
// tsconfig.app.json deliberately gives src/ no node types — the app has no
// business seeing `process` or `fs`. It joins check-core-boundary.mjs and
// check-database-types.mjs as a repo-wide static invariant run by `npm run lint`.
//
// It earns its place: a renamed anchor otherwise fails silently at runtime (the
// step is skipped) or as an unexplained 60-second Playwright timeout. This names
// the missing anchor in about a second.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STEPS_FILE = 'src/modules/optional/product-tour/tourSteps.ts'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const steps = readFileSync(STEPS_FILE, 'utf8')
const anchors = [...steps.matchAll(/^\s*anchor: '([^']+)'/gm)].map((m) => m[1])

if (anchors.length === 0) {
  console.error(`no anchors found in ${STEPS_FILE} — has its shape changed?`)
  process.exit(1)
}

const source = walk('src')
  .filter((file) => file !== STEPS_FILE)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const missing = anchors.filter((anchor) => !source.includes(`data-tour="${anchor}"`))
if (missing.length > 0) {
  console.error('product tour steps point at anchors that no longer exist in src/:')
  for (const anchor of missing) console.error(`  data-tour="${anchor}"`)
  process.exit(1)
}

if (!source.includes('data-tour-tiers')) {
  console.error('no data-tour-tiers marker in src/: the tour cannot pick a tiered product')
  process.exit(1)
}

console.log(`tour anchors OK (${anchors.length})`)
