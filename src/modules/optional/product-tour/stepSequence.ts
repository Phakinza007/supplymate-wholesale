import type { TourStep } from './tourSteps'

/**
 * The tour must run start to finish without a login, so steps behind
 * ProtectedRoute are removed from the plan rather than shown and skipped — a
 * visitor should never read "ขั้นที่ 7 จาก 8" for a step they cannot reach.
 */
export function planSteps(
  all: readonly TourStep[],
  { hasSession }: { hasSession: boolean },
): TourStep[] {
  return all.filter((step) => !step.requiresSession || hasSession)
}

export function progressLabel(index: number, total: number): string {
  return `ขั้นที่ ${index + 1} จาก ${total}`
}
