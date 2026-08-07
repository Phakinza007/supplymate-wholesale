#!/usr/bin/env node
// Generates .env.e2e.local from the running local Supabase stack's own status output, so the
// E2E suite never hardcodes a URL/key that could drift from what `supabase start` actually
// produces on this machine or this CLI version.
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const output = execSync('npx supabase status -o env', { encoding: 'utf-8' })

function extract(key) {
  const match = output.match(new RegExp(`^${key}="?([^"\n]*)"?$`, 'm'))
  if (!match) {
    throw new Error(
      `Could not find ${key} in \`supabase status -o env\` output. Full output:\n${output}`,
    )
  }
  return match[1]
}

const apiUrl = extract('API_URL')
const anonKey = extract('ANON_KEY')

writeFileSync(
  '.env.e2e.local',
  `VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
)
console.log(`Wrote .env.e2e.local (VITE_SUPABASE_URL=${apiUrl})`)
