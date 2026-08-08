import { describe, expect, it } from 'vitest'
import { toShowcaseAssetUrl } from './assetUrl'

describe('toShowcaseAssetUrl', () => {
  it('keeps generated public assets beneath a GitHub Pages base path', () => {
    expect(
      toShowcaseAssetUrl('/images/supplymate/cups-lids.png', '/supplymate-wholesale/'),
    ).toBe('/supplymate-wholesale/images/supplymate/cups-lids.png')
  })

  it('keeps root-hosted development assets root-relative', () => {
    expect(toShowcaseAssetUrl('/images/supplymate/cups-lids.png', '/')).toBe(
      '/images/supplymate/cups-lids.png',
    )
  })
})
