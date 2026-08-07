import { brandConfig, type FeatureFlags } from '@/config/branding.config'

export function useFeature(flag: keyof FeatureFlags): boolean {
  return brandConfig.features[flag]
}
