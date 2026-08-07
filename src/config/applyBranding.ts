import { brandConfig } from '@/config/branding.config'

/**
 * Pushes branding.config.ts colors/theme onto :root as CSS custom properties
 * so a client reskins the whole UI by editing one file. Call once at boot.
 */
export function applyBranding() {
  const root = document.documentElement
  root.style.setProperty('--brand-primary', brandConfig.colors.primary)
  root.style.setProperty('--brand-secondary', brandConfig.colors.secondary)
  root.classList.toggle('dark', brandConfig.theme === 'dark')
  document.title = brandConfig.storeName
}
