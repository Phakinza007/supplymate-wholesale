import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    // Sibling git worktrees (gitignored) live under `.worktrees/` or
    // `.claude/worktrees/` depending on who created them. Without both, vitest
    // walks into their `e2e/` folders and tries to run Playwright specs.
    exclude: ['e2e/**', '.worktrees/**', '.claude/worktrees/**', 'node_modules/**'],
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
