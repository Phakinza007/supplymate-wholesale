import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const deployTarget =
  process.env.VITE_DEPLOY_TARGET ??
  (process.env.npm_lifecycle_event === 'build:pages' ? 'github-pages' : undefined)
const isGitHubPagesBuild = deployTarget === 'github-pages'

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubPagesBuild ? '/supplymate-wholesale/' : '/',
  define: deployTarget
    ? {
        'import.meta.env.VITE_DEPLOY_TARGET': JSON.stringify(deployTarget),
        'import.meta.env.VITE_SHOWCASE_MODE': JSON.stringify('true'),
      }
    : undefined,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
