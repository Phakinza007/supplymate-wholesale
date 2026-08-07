#!/usr/bin/env node
// The installed Supabase CLI does not reliably emit the __InternalSupabase
// block on `supabase gen types typescript --local` (confirmed: present or
// absent independent of --schema public) -- supabase-js falls back to
// PostgrestVersion '12' when it's missing, silently mistyping any
// PostgREST-14-specific feature flags. This has regressed twice already
// across Phase 2 modules; catch it here instead of relying on a reviewer
// to notice a third time.
import { readFileSync } from 'node:fs'

const content = readFileSync('src/lib/database.types.ts', 'utf8')
if (!content.includes('PostgrestVersion')) {
  console.error(
    'src/lib/database.types.ts is missing the __InternalSupabase block -- ' +
    'the installed Supabase CLI does not reliably emit it. Restore it manually ' +
    '(see git history for the exact block/format) after any `supabase gen types` run.',
  )
  process.exit(1)
}
console.log('database.types.ts __InternalSupabase check OK')
