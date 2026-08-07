import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.e2e.local' })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'vite --mode e2e --port 5174 --strictPort',
    url: 'http://localhost:5174',
    // Never reuse a server already running on this port (e.g. a developer's
    // `npm run dev`, which loads `.env` -- the real hosted Supabase project --
    // instead of `.env.e2e.local`). Always start a fresh, e2e-configured
    // server for this command; a dedicated port (5174, distinct from the
    // default 5173) plus --strictPort means startup fails loudly instead of
    // silently reusing the wrong server if the port is somehow taken.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
