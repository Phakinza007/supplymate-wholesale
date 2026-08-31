import { existsSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { demoProducts } from './catalogue'

const ART_DIR = 'public/images/supplymate/products'

describe('catalogue art coverage', () => {
  it('ships an illustration for every product', () => {
    const missing = demoProducts.filter((product) => !existsSync(`public${product.imagePath}`))
    expect(missing.map((product) => product.slug)).toEqual([])
  })

  it('keeps no orphaned illustrations behind a renamed slug', () => {
    const onDisk = readdirSync(ART_DIR).filter((name) => name.endsWith('.svg'))
    const expected = demoProducts.map((product) => `${product.slug}.svg`)
    expect(onDisk.sort()).toEqual(expected.sort())
  })
})
