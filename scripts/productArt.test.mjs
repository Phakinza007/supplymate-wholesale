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

// -- Safe-band coverage ------------------------------------------------
// `.wholesale-product-card img` is `aspect-ratio: 4/3` with `object-fit:
// cover`, which crops the top and bottom 80 units off this 640-square
// viewBox (see the comment above `BASE` in productArt.mjs) -- only y
// 80..560 is ever visible on a card. The bug that prompted this test was
// found by eye, not by a test: a caption baseline at 558 had every
// descender sliced off. This reads every explicit numeric coordinate back
// out of the emitted markup -- `d` path data, `cx`/`cy`/`rx`/`ry`,
// `x`/`y`/`width`/`height` -- and asserts none of it implies a point
// outside that band.
//
// Known limitation: this reads explicit coordinates only. A curve's apex
// between its control points (a `Q`'s midpoint, an `A`'s arc bulge) is not
// itself a coordinate in the markup, so a curve that stays within its own
// control points' bounding box but bulges outside the band between them
// can still escape this test undetected.
const SAFE_TOP = 80
const SAFE_BOTTOM = 560

// Only M/L/Q/A/Z commands are ever emitted (draw()/seg() always write
// absolute, uppercase commands) -- this deliberately throws on anything
// else so a future path command is a loud reminder to extend the parser
// rather than a silent gap in coverage.
function pathYCoordinates(d) {
  const tokens = d.trim().split(/\s+/)
  const ys = []
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]
    i += 1
    if (cmd === 'M' || cmd === 'L') {
      // One or more implicit-lineto pairs can follow M or L directly.
      while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
        ys.push(Number(tokens[i + 1]))
        i += 2
      }
    } else if (cmd === 'Q') {
      // control-point y, endpoint y
      ys.push(Number(tokens[i + 1]), Number(tokens[i + 3]))
      i += 4
    } else if (cmd === 'A') {
      // rx ry x-rotation large-arc-flag sweep-flag x y -- only the endpoint
      // is a coordinate; rx/ry are radii, not points (part of the curve-apex
      // limitation above).
      ys.push(Number(tokens[i + 6]))
      i += 7
    } else if (cmd === 'Z') {
      // closepath, no operands
    } else {
      throw new Error(`pathYCoordinates doesn't know command "${cmd}" (in "${d}")`)
    }
  }
  return ys
}

function drawingYCoordinates(svg) {
  const ys = []

  for (const [, d] of svg.matchAll(/\sd="([^"]*)"/g)) {
    ys.push(...pathYCoordinates(d))
  }

  for (const tag of svg.match(/<ellipse[^>]*>/g) ?? []) {
    const cy = Number(tag.match(/\scy="(-?[\d.]+)"/)?.[1])
    const ry = Number(tag.match(/\sry="(-?[\d.]+)"/)?.[1])
    ys.push(cy - ry, cy + ry)
  }

  for (const tag of svg.match(/<rect[^>]*>/g) ?? []) {
    const y = Number(tag.match(/\sy="(-?[\d.]+)"/)?.[1])
    const height = Number(tag.match(/\sheight="(-?[\d.]+)"/)?.[1])
    ys.push(y, y + height)
  }

  return ys
}

function captionMetrics(svg) {
  const tag = svg.match(/<text[^>]*>/)?.[0]
  if (!tag) throw new Error('no <text> element found')
  return {
    y: Number(tag.match(/\sy="(-?[\d.]+)"/)?.[1]),
    fontSize: Number(tag.match(/\sfont-size="(-?[\d.]+)"/)?.[1]),
  }
}

describe('catalogue art stays inside the card crop band (y 80..560)', () => {
  it('keeps every explicit drawing coordinate, for every catalogue product, inside the band', () => {
    const violations = []
    for (const product of catalogue.products) {
      const svg = renderProductArt({
        shape: product.art.shape,
        caption: product.art.caption,
        label: product.name,
        options: product.art.options ?? {},
      })
      for (const y of drawingYCoordinates(svg)) {
        if (y < SAFE_TOP || y > SAFE_BOTTOM) {
          violations.push(`${product.slug} (${product.art.shape}): y=${y}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("keeps every catalogue product's caption clear of the bottom crop, with descender headroom", () => {
    // ui-sans-serif descenders run roughly 20-30% of font-size below the
    // baseline for this font stack; there's no font-shaping library in this
    // repo to measure it exactly (and none is being added for one test), so
    // 0.3 is a deliberately generous stand-in for "how far a descender could
    // plausibly reach." This is the check that would have caught the actual
    // bug: a baseline of 558 fails it (558 + 34*0.3 = 568.2 > 560), the
    // shipped baseline of 534 clears it with room to spare (544.2 <= 560).
    const DESCENDER_ALLOWANCE = 0.3
    const violations = []
    for (const product of catalogue.products) {
      const svg = renderProductArt({
        shape: product.art.shape,
        caption: product.art.caption,
        label: product.name,
        options: product.art.options ?? {},
      })
      const { y, fontSize } = captionMetrics(svg)
      if (y < SAFE_TOP || y + fontSize * DESCENDER_ALLOWANCE > SAFE_BOTTOM) {
        violations.push(`${product.slug}: caption y=${y} font-size=${fontSize}`)
      }
    }
    expect(violations).toEqual([])
  })

  // Proof the checks above have teeth, without shipping a real product with
  // bad geometry to demonstrate it: fed a synthetic out-of-band point/
  // caption, both helpers must flag it.
  it('flags coordinates that fall outside the safe band', () => {
    expect(pathYCoordinates('M 100 40 L 200 600')).toEqual(
      expect.arrayContaining([40, 600]),
    )
    expect([40, 600].some((y) => y < SAFE_TOP || y > SAFE_BOTTOM)).toBe(true)

    const tooLow = captionMetrics('<text x="320" y="558" font-size="34">demo</text>')
    expect(tooLow.y + tooLow.fontSize * 0.3 > SAFE_BOTTOM).toBe(true)
  })
})
