import { describe, expect, it } from 'vitest'
import { resolveImageUrl } from './resolveImageUrl'

describe('resolveImageUrl', () => {
  it('returns generated local public assets unchanged', () => {
    expect(resolveImageUrl('/images/supplymate/cups-lids.png'))
      .toBe('/images/supplymate/cups-lids.png')
  })
})
