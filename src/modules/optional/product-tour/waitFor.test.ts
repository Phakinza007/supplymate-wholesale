import { describe, expect, it, vi } from 'vitest'
import { waitFor } from './waitFor'

const instant = () => Promise.resolve()

describe('waitFor', () => {
  it('returns immediately when the value is already there', async () => {
    const probe = vi.fn(() => 'here')
    expect(await waitFor(probe, { attempts: 5, sleep: instant })).toBe('here')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('keeps probing until the value shows up', async () => {
    let calls = 0
    const probe = () => (++calls < 4 ? null : 'late')
    expect(await waitFor(probe, { attempts: 10, sleep: instant })).toBe('late')
    expect(calls).toBe(4)
  })

  it('gives up rather than hanging when the value never arrives', async () => {
    // A tour that waits forever on a slow query is worse than one that skips
    // the step, so the budget is finite and the result is null.
    const probe = vi.fn(() => null)
    expect(await waitFor(probe, { attempts: 3, sleep: instant })).toBeNull()
    expect(probe).toHaveBeenCalledTimes(3)
  })
})
