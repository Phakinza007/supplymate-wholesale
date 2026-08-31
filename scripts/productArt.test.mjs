import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SHAPES, renderProductArt } from './productArt.mjs'

const render = (shape) =>
  renderProductArt({ shape, caption: '10 oz', label: 'ตัวอย่างสินค้า', options: {} })

// A duplicate attribute on one element (e.g. two `stroke-width`s from combining
// a shared constant like `soft`/`mark` with an explicit override) is an XML
// well-formedness violation that breaks loading the file as <img src>, even
// though it's invisible to a substring check. This is a small hand-rolled
// scan over each `<tag ...>` -- not a full XML parser, and deliberately not
// one: it only needs to catch a repeated attribute name, and pulling in an
// XML library for that would be overkill for a build script with no other
// XML-parsing need.
function tagsOf(svg) {
  return svg.match(/<[a-zA-Z][^>]*>/g) ?? []
}

function duplicateAttributeNames(tag) {
  const names = []
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"/g
  let match
  while ((match = attrPattern.exec(tag))) {
    names.push(match[1])
  }
  return names.filter((name, index) => names.indexOf(name) !== index)
}

const catalogue = JSON.parse(
  readFileSync(new URL('../src/demo/catalogue.data.json', import.meta.url), 'utf8'),
)

describe('renderProductArt', () => {
  it('renders one self-contained SVG root at a square viewBox', () => {
    const svg = render('cup')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg.match(/<svg/g)).toHaveLength(1)
    expect(svg).toContain('viewBox="0 0 640 640"')
  })

  it('never reaches outside the file', () => {
    for (const shape of Object.keys(SHAPES)) {
      const svg = render(shape)
      expect(svg).not.toContain('http://www.w3.org/1999/xlink')
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/)
      expect(svg).not.toContain('<image')
      expect(svg).not.toContain('@import')
    }
  })

  it('labels the drawing for assistive technology and prints the caption', () => {
    const svg = renderProductArt({
      shape: 'bag',
      caption: 'size M',
      label: 'ถุงกระดาษ & ฝา',
      options: { handle: true },
    })
    expect(svg).toContain('aria-label="ถุงกระดาษ &amp; ฝา"')
    expect(svg).toContain('>size M<')
  })

  it('draws something for every shape in the vocabulary', () => {
    for (const shape of Object.keys(SHAPES)) {
      expect(SHAPES[shape]({}).join('').length).toBeGreaterThan(40)
    }
  })

  it('rejects an unknown shape rather than emitting an empty drawing', () => {
    expect(() => render('teapot')).toThrow(/teapot/)
  })

  it('emits well-formed XML for every product in the catalogue -- no element repeats an attribute', () => {
    for (const product of catalogue.products) {
      const svg = renderProductArt({
        shape: product.art.shape,
        caption: product.art.caption,
        label: product.name,
        options: product.art.options ?? {},
      })

      for (const tag of tagsOf(svg)) {
        const duplicates = duplicateAttributeNames(tag)
        expect(duplicates, `${product.slug} (${product.art.shape}): ${tag}`).toEqual([])
      }
    }
  })
})
