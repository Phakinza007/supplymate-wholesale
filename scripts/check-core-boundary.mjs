#!/usr/bin/env node
// Fails if anything under src/core imports from src/modules/optional.
// Core must run correctly with every optional feature flag off — see CLAUDE.md.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CORE_DIR = 'src/core'
const FORBIDDEN = /from\s+['"](@\/modules\/optional|\.\.?\/.*modules\/optional)/

function walk(dir) {
  const violations = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      violations.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      const content = readFileSync(full, 'utf8')
      if (FORBIDDEN.test(content)) violations.push(full)
    }
  }
  return violations
}

const violations = walk(CORE_DIR)
if (violations.length > 0) {
  console.error('src/core must never import from src/modules/optional:')
  for (const file of violations) console.error(`  ${file}`)
  process.exit(1)
}
console.log('core/optional boundary OK')
