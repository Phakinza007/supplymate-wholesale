/**
 * Poll `probe` until it returns something, or the attempt budget runs out.
 *
 * The tour runs against a Supabase-backed app, so a step's anchor may simply
 * not exist yet when the tour arrives. `sleep` is injectable so this is
 * testable in the node environment without fake timers, and the budget is
 * counted in attempts rather than wall-clock so the tests are deterministic.
 *
 * Returning null is a normal outcome, not an error: the caller skips the step.
 */
export async function waitFor<T>(
  probe: () => T | null,
  {
    attempts = 40,
    intervalMs = 50,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const found = probe()
    if (found !== null && found !== undefined) return found
    if (i < attempts - 1) await sleep(intervalMs)
  }
  return null
}
