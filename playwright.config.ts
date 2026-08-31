import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.e2e.local' })

const wantedServers = process.env.E2E_SERVERS
const appServer = {
  command: 'VITE_SHOWCASE_MODE=false vite --mode e2e --port 5174 --strictPort',
  url: 'http://localhost:5174',
  reuseExistingServer: false,
  timeout: 30_000,
}
const showcaseServer = {
  command: 'vite --mode e2e --port 5175 --strictPort',
  url: 'http://localhost:5175',
  reuseExistingServer: false,
  timeout: 30_000,
}
const servers =
  wantedServers === 'showcase' ? [showcaseServer]
  : wantedServers === 'app' ? [appServer]
  : [appServer, showcaseServer]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // The golden path drives two browser contexts through signup, address,
  // order, slip upload and three admin transitions. Warm it runs in ~3s; on a
  // cold Supabase it has been measured at ~25s, which the 30s default clips
  // often enough to look like a code failure. The budget was too tight, not
  // the test.
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
  // Two entries, two servers. `src/main.tsx` picks its entry from a build-time
  // flag, so the Supabase-backed app and the static showcase cannot be served
  // by one dev server -- each project points at the one that mounts what it
  // tests. Without this split, mounting the real app at 5174 would silently
  // break every showcase spec (and vice versa).
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/static-showcase.spec.ts', '**/task-3-shell.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      name: 'showcase',
      testMatch: ['**/static-showcase.spec.ts', '**/task-3-shell.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
  ],
  // Never reuse a server already running on these ports (e.g. a developer's
  // `npm run dev`, which loads `.env` -- the real hosted Supabase project --
  // instead of `.env.e2e.local`). Always start fresh, e2e-configured servers;
  // dedicated ports (distinct from the default 5173) plus --strictPort mean
  // startup fails loudly instead of silently reusing the wrong server.
  //
  // Only start the server the run actually needs: E2E_SERVERS=showcase for the
  // showcase-only script. Booting both for a single-project run wastes a
  // Supabase-backed dev server and leaves an orphan on 5174 if Playwright fails
  // to reap it, which then blocks the next run with a port conflict.
  webServer: servers,
})
