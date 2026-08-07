import type { ReactNode } from 'react'
import type { FeatureFlags } from '@/config/branding.config'
import { useFeature } from '@/lib/useFeature'

/**
 * Gates a subtree behind a feature flag. Pair with React.lazy() for the
 * children so disabled optional modules never enter the bundle:
 *
 *   const Reviews = lazy(() => import('@/modules/optional/reviews'))
 *   <Feature flag="reviews"><Suspense><Reviews /></Suspense></Feature>
 */
export function Feature({
  flag,
  children,
}: {
  flag: keyof FeatureFlags
  children: ReactNode
}) {
  return useFeature(flag) ? <>{children}</> : null
}
