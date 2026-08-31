import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Plain ESM, run directly by vitest's default include glob -- deliberately
// not part of the `src` TypeScript program (tsconfig.app.json's `types` is
// scoped to `vite/client` only, with no `node` entry, so a `node:fs` import
// from inside `src` fails `npm run typecheck`). Reading the shared JSON
// catalogue with plain `node:fs` here, same precedent as productArt.test.mjs.
const ART_DIR = new URL('../public/images/supplymate/products/', import.meta.url)

const catalogue = JSON.parse(
  readFileSync(new URL('../src/demo/catalogue.data.json', import.meta.url), 'utf8'),
)

describe('catalogue art coverage', () => {
  it('ships an illustration for every product', () => {
    const missing = catalogue.products
      .filter((product) => !existsSync(new URL(`${product.slug}.svg`, ART_DIR)))
      .map((product) => product.slug)
    expect(missing).toEqual([])
  })

  it('keeps no orphaned illustrations behind a renamed slug', () => {
    const onDisk = readdirSync(ART_DIR).filter((name) => name.endsWith('.svg'))
    const expected = catalogue.products.map((product) => `${product.slug}.svg`)
    expect(onDisk.sort()).toEqual(expected.sort())
  })
})
