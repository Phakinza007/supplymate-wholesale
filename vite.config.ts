import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const deployTarget =
  process.env.VITE_DEPLOY_TARGET ??
  (process.env.npm_lifecycle_event === 'build:pages' ? 'github-pages' : undefined)
const isGitHubPagesBuild = deployTarget === 'github-pages'

// The static showcase is the default entry: it runs with no Supabase project
// configured, which is what makes the Pages deploy and a fresh clone work.
// `VITE_SHOWCASE_MODE=false` (npm run dev:app / build:app, and Playwright's
// app server) mounts the real Supabase-backed app instead — src/lib/supabase.ts
// throws at module scope without the env vars, so that stays opt-in.
//
// Defined unconditionally so `src/main.tsx` can branch on a literal at build
// time: with the value inlined, Rollup drops the unused branch *and* its
// dynamic import, which is what keeps Supabase code out of the Pages bundle
// (scripts/assert-static-showcase.mjs enforces exactly that).
const showcaseMode = process.env.VITE_SHOWCASE_MODE !== 'false'

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubPagesBuild ? '/supplymate-wholesale/' : '/',
  define: {
    'import.meta.env.VITE_DEPLOY_TARGET': JSON.stringify(deployTarget ?? ''),
    'import.meta.env.VITE_SHOWCASE_MODE': JSON.stringify(showcaseMode ? 'true' : 'false'),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
