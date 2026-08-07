import { brandConfig } from '@/config/branding.config'

export function formatPrice(value: number): string {
  return `${brandConfig.currencySymbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
