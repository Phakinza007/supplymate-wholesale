// Per-product catalogue art. Line drawings, not photography: the showcase
// ships one owned illustration per product instead of repeating six stock
// photos across thirty-six cards. Everything is inlined -- these load through
// <img>, so they cannot reach a webfont, a stylesheet, or the page's tokens.
// The palette below therefore repeats the Ledger neutrals as literal hex.
export const PAPER = '#f1f1f5'
export const INK = '#2b2d3c'
export const HAIRLINE = '#c9c9d3'
export const CAPTION = '#5c5d6c'
export const ACCENT = '#4a63c8'

const CX = 320
const BASE = 470
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

const n = (value) => Math.round(value * 10) / 10

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const draw = (d, extra = '') => `    <path d="${d}"${extra ? ` ${extra}` : ''}/>`
const oval = (cx, cy, rx, ry, extra = '') =>
  `    <ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${extra ? ` ${extra}` : ''}/>`
const seg = (x1, y1, x2, y2, extra = '') => draw(`M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`, extra)
const soft = `stroke="${HAIRLINE}" stroke-width="5"`
const mark = `stroke="${ACCENT}" stroke-width="7"`
const box = (x, y, w, h, r, extra = '') =>
  `    <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}"${extra ? ` ${extra}` : ''}/>`

function cup({ topWidth = 180, bottomWidth = 130, height = 250, lid = 'none', texture = 'clear' }) {
  const top = BASE - height
  const halfTop = topWidth / 2
  const halfBottom = bottomWidth / 2
  const halfAt = (t) => (topWidth + (bottomWidth - topWidth) * t) / 2
  const parts = [
    draw(
      `M ${n(CX - halfTop)} ${top} L ${n(CX - halfBottom)} ${BASE - 14}` +
        ` Q ${n(CX - halfBottom)} ${BASE} ${n(CX - halfBottom + 14)} ${BASE}` +
        ` L ${n(CX + halfBottom - 14)} ${BASE}` +
        ` Q ${n(CX + halfBottom)} ${BASE} ${n(CX + halfBottom)} ${BASE - 14}` +
        ` L ${n(CX + halfTop)} ${top}`,
    ),
    oval(CX, top, halfTop, 16),
  ]

  if (texture === 'paper') {
    for (const t of [0.34, 0.46]) {
      const y = top + height * t
      parts.push(seg(CX - halfAt(t) + 10, y, CX + halfAt(t) - 10, y, soft))
    }
  } else {
    parts.push(seg(CX - halfTop + 28, top + 38, CX - halfAt(0.72) + 24, top + height * 0.72, soft))
  }

  if (lid === 'flat') {
    parts.push(
      draw(
        `M ${n(CX - halfTop - 14)} ${top - 4} L ${n(CX - halfTop - 14)} ${top - 30}` +
          ` L ${n(CX + halfTop + 14)} ${top - 30} L ${n(CX + halfTop + 14)} ${top - 4}`,
      ),
      oval(CX, top - 30, halfTop + 14, 15),
      seg(CX - 18, top - 34, CX + 18, top - 34, mark),
    )
  }

  if (lid === 'dome') {
    parts.push(
      draw(
        `M ${n(CX - halfTop - 14)} ${top - 4}` +
          ` A ${n(halfTop + 14)} ${n(halfTop * 0.82)} 0 0 1 ${n(CX + halfTop + 14)} ${top - 4}`,
      ),
      oval(CX, top - 4, halfTop + 14, 15),
      seg(CX, top - halfTop * 0.72, CX, top - halfTop * 0.72 + 36, mark),
    )
  }

  return parts
}

function lid({ dome = false }) {
  const cy = BASE - 62
  const rx = 150
  const parts = [
    oval(CX, cy, rx, 52),
    draw(`M ${CX - rx} ${cy} L ${CX - rx} ${cy + 32} Q ${CX} ${cy + 80} ${CX + rx} ${cy + 32} L ${CX + rx} ${cy}`),
  ]

  if (dome) {
    parts.push(
      draw(`M ${n(CX - rx + 12)} ${cy - 10} A ${n(rx - 12)} 116 0 0 1 ${n(CX + rx - 12)} ${cy - 10}`),
      seg(CX, cy - 120, CX, cy - 86, mark),
    )
  } else {
    parts.push(oval(CX, cy, rx - 36, 36, soft), seg(CX - 24, cy - 4, CX + 24, cy - 4, mark))
  }

  return parts
}

function carrier() {
  const left = CX - 168
  const right = CX + 168
  const top = BASE - 128
  return [
    draw(`M ${left} ${top} L ${n(left + 26)} ${BASE} L ${n(right - 26)} ${BASE} L ${right} ${top} Z`),
    seg(left, top, right, top),
    draw(`M ${CX - 94} ${top} A 94 98 0 0 1 ${CX + 94} ${top}`),
    ...[-106, -36, 36, 106].map((dx) => oval(CX + dx, top + 26, 30, 13, soft)),
  ]
}

function bowl({ lid: hasLid = true, texture = 'clear' }) {
  const rim = BASE - 150
  const parts = [
    draw(`M ${CX - 150} ${rim} Q ${CX - 128} ${BASE} ${CX} ${BASE} Q ${CX + 128} ${BASE} ${CX + 150} ${rim}`),
    oval(CX, rim, 150, 28),
  ]

  if (hasLid) {
    parts.push(
      oval(CX, rim - 42, 158, 30),
      seg(CX - 158, rim - 42, CX - 158, rim - 22),
      seg(CX + 158, rim - 42, CX + 158, rim - 22),
      seg(CX - 26, rim - 58, CX + 26, rim - 58, mark),
    )
  }

  parts.push(
    texture === 'kraft'
      ? draw(`M ${CX - 110} ${rim + 60} Q ${CX} ${rim + 82} ${CX + 110} ${rim + 60}`, soft)
      : seg(CX - 108, rim + 44, CX - 92, rim + 96, soft),
  )

  return parts
}

function bag({ handle = true, width = 200, height = 250, window: hasWindow = false, open = false, flatBase = false }) {
  const half = width / 2
  const top = BASE - height
  const parts = [
    draw(`M ${n(CX - half)} ${top} L ${n(CX - half)} ${BASE} L ${n(CX + half)} ${BASE} L ${n(CX + half)} ${top} Z`),
    seg(CX + half - 34, top, CX + half - 34, BASE, soft),
  ]

  parts.push(
    open
      ? draw(
          `M ${n(CX - half)} ${top} L ${n(CX - half / 2)} ${top - 18}` +
            ` L ${CX} ${top} L ${n(CX + half / 2)} ${top - 18} L ${n(CX + half)} ${top}`,
        )
      : seg(CX - half, top + 30, CX + half, top + 30, soft),
  )

  if (handle) {
    parts.push(
      draw(`M ${n(CX - half / 2)} ${top + 6} A ${n(half / 2)} ${n(half / 2 + 10)} 0 0 1 ${n(CX + half / 2)} ${top + 6}`),
    )
  }

  if (hasWindow) {
    parts.push(box(CX - half + 40, top + 62, width - 114, height - 132, 12, soft))
  }

  if (flatBase) {
    parts.push(seg(CX - half + 12, BASE - 26, CX + half - 46, BASE - 26, soft))
  }

  return parts
}

function roll({ width = 210, label = 'wide' }) {
  const half = width / 2
  const top = BASE - 210
  const parts = [
    draw(`M ${n(CX - half)} ${top} L ${n(CX - half)} ${BASE - 60} L ${n(CX + half)} ${BASE - 60} L ${n(CX + half)} ${top}`),
    oval(CX, top, half, 46),
    oval(CX, BASE - 60, half, 46),
    oval(CX, top, half / 2.6, 18, soft),
  ]

  if (label === 'wide') {
    parts.push(
      draw(`M ${n(CX + half)} ${BASE - 108} L ${n(CX + half + 96)} ${BASE - 74} L ${n(CX + half + 96)} ${BASE - 6} L ${n(CX + half)} ${BASE - 40} Z`),
      seg(CX + half + 18, BASE - 74, CX + half + 82, BASE - 52, mark),
    )
  } else if (label === 'round') {
    parts.push(
      draw(`M ${n(CX + half)} ${BASE - 108} L ${n(CX + half + 96)} ${BASE - 74} L ${n(CX + half + 96)} ${BASE - 6} L ${n(CX + half)} ${BASE - 40} Z`),
      oval(CX + half + 48, BASE - 56, 22, 20, mark),
    )
  } else {
    parts.push(draw(`M ${n(CX + half)} ${BASE - 96} L ${n(CX + half + 72)} ${BASE - 62} L ${n(CX + half + 72)} ${BASE - 26} L ${n(CX + half)} ${BASE - 60}`, soft))
  }

  return parts
}

function sheet() {
  const left = CX - 150
  const top = BASE - 300
  const parts = [box(left, top, 300, 300, 14)]
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      parts.push(box(left + 28 + column * 132, top + 30 + row * 90, 116, 62, 10, soft))
    }
  }
  parts.push(seg(left + 44, top + 60, left + 128, top + 60, mark))
  return parts
}

function tool({ head = 'spoon', twist = false }) {
  const topX = CX - 74
  const topY = BASE - 320
  const tipX = CX + 42
  const tipY = BASE - 70
  const parts = [seg(topX, topY, tipX, tipY)]

  parts.push(
    head === 'scoop'
      ? draw(`M ${n(tipX - 34)} ${tipY - 6} Q ${n(tipX + 6)} ${BASE + 4} ${n(tipX + 62)} ${tipY + 6} L ${n(tipX + 26)} ${tipY - 30} Z`)
      : oval(tipX + 22, tipY + 26, 40, 26),
  )

  if (twist) {
    for (let step = 0; step < 6; step += 1) {
      const t = 0.18 + step * 0.11
      parts.push(
        seg(topX + (tipX - topX) * t - 12, topY + (tipY - topY) * t + 6, topX + (tipX - topX) * t + 12, topY + (tipY - topY) * t - 6, soft),
      )
    }
  } else {
    parts.push(oval(topX + 4, topY + 10, 20, 12, soft))
  }

  return parts
}

function shaker() {
  const top = BASE - 330
  return [
    draw(`M ${CX - 62} ${top + 60} L ${CX - 96} ${BASE} L ${CX + 96} ${BASE} L ${CX + 62} ${top + 60} Z`),
    seg(CX - 62, top + 60, CX + 62, top + 60),
    draw(`M ${CX - 58} ${top + 60} L ${CX - 58} ${top + 24} L ${CX + 58} ${top + 24} L ${CX + 58} ${top + 60}`),
    seg(CX - 58, top + 24, CX + 58, top + 24),
    draw(`M ${CX - 34} ${top + 24} L ${CX - 34} ${top} L ${CX + 34} ${top} L ${CX + 34} ${top + 24}`),
    oval(CX, top, 34, 12),
    seg(CX - 96, BASE - 74, CX + 96, BASE - 74, soft),
  ]
}

function pitcher() {
  const top = BASE - 260
  return [
    draw(`M ${CX - 86} ${top} L ${CX - 108} ${BASE} L ${CX + 68} ${BASE} L ${CX + 48} ${top} Z`),
    oval(CX - 19, top, 67, 20),
    draw(`M ${CX + 48} ${top + 6} L ${CX + 104} ${top - 20} L ${CX + 60} ${top + 40}`),
    draw(`M ${CX + 62} ${top + 78} Q ${CX + 132} ${top + 116} ${CX + 74} ${top + 176}`),
    seg(CX - 78, top + 92, CX + 46, top + 92, soft),
  ]
}

function pump() {
  const top = BASE - 210
  return [
    box(CX - 84, top, 168, 210, 18),
    seg(CX - 84, top + 54, CX + 84, top + 54, soft),
    draw(`M ${CX - 26} ${top} L ${CX - 26} ${top - 52} L ${CX + 26} ${top - 52} L ${CX + 26} ${top}`),
    draw(`M ${CX - 26} ${top - 52} L ${CX - 86} ${top - 74} L ${CX - 86} ${top - 96}`),
    seg(CX + 26, top - 96, CX + 86, top - 96, mark),
    seg(CX, top + 20, CX, top + 186, soft),
  ]
}

function stick({ tip = 'round' }) {
  const parts = [
    draw(`M ${CX - 66} ${BASE - 300} L ${CX + 14} ${BASE - 40}`, `stroke-width="22"`),
    draw(`M ${CX + 40} ${BASE - 286} L ${CX + 104} ${BASE - 56}`, `stroke="${HAIRLINE}" stroke-width="16"`),
  ]

  parts.push(
    tip === 'flat'
      ? draw(`M ${CX - 4} ${BASE - 86} L ${CX + 44} ${BASE - 72} L ${CX + 32} ${BASE - 26} L ${CX - 18} ${BASE - 40} Z`)
      : oval(CX + 14, BASE - 40, 20, 20),
  )

  return parts
}

function plate() {
  return [
    oval(CX, BASE - 150, 210, 76),
    oval(CX, BASE - 150, 152, 52, soft),
    draw(`M ${CX - 210} ${BASE - 148} Q ${CX} ${BASE - 44} ${CX + 210} ${BASE - 148}`),
    draw(`M ${CX - 186} ${BASE - 66} Q ${CX} ${BASE + 6} ${CX + 186} ${BASE - 66}`, soft),
  ]
}

function straws() {
  return [
    draw(`M ${CX - 122} ${BASE} L ${CX - 66} ${BASE - 310}`, `stroke-width="20"`),
    draw(`M ${CX - 18} ${BASE} L ${CX + 24} ${BASE - 310}`, `stroke-width="26"`),
    draw(`M ${CX + 86} ${BASE} L ${CX + 118} ${BASE - 234} L ${CX + 178} ${BASE - 280}`, `stroke-width="20"`),
    seg(CX - 78, BASE - 244, CX - 58, BASE - 246, mark),
  ]
}

function cutlery() {
  const top = BASE - 320
  return [
    box(CX - 132, top, 264, 320, 20),
    seg(CX - 132, top + 46, CX + 132, top + 46, soft),
    draw(`M ${CX - 62} ${BASE - 60} L ${CX - 62} ${top + 150}`, `stroke-width="12"`),
    draw(`M ${CX - 90} ${top + 92} L ${CX - 90} ${top + 150} L ${CX - 34} ${top + 150} L ${CX - 34} ${top + 92}`),
    seg(CX - 62, top + 92, CX - 62, top + 150, soft),
    draw(`M ${CX + 62} ${BASE - 60} L ${CX + 62} ${top + 148}`, `stroke-width="12"`),
    oval(CX + 62, top + 116, 32, 40),
  ]
}

export const SHAPES = {
  cup,
  lid,
  carrier,
  bowl,
  bag,
  roll,
  sheet,
  tool,
  shaker,
  pitcher,
  pump,
  stick,
  plate,
  straws,
  cutlery,
  box: boxShape,
}

function boxShape({ style = 'lunch' }) {
  if (style === 'noodle') {
    const top = BASE - 250
    return [
      draw(`M ${CX - 122} ${top} L ${CX - 88} ${BASE} L ${CX + 88} ${BASE} L ${CX + 122} ${top} Z`),
      seg(CX - 122, top, CX + 122, top),
      draw(`M ${CX - 66} ${top - 4} A 66 74 0 0 1 ${CX + 66} ${top - 4}`, mark),
      seg(CX - 88, BASE - 72, CX + 88, BASE - 72, soft),
    ]
  }

  if (style === 'clamshell') {
    return [
      box(CX - 176, BASE - 78, 352, 78, 12),
      box(CX - 176, BASE - 154, 352, 76, 12),
      oval(CX - 176, BASE - 116, 12, 12, soft),
      seg(CX + 152, BASE - 100, CX + 200, BASE - 100, mark),
    ]
  }

  if (style === 'tray') {
    return [
      box(CX - 186, BASE - 110, 372, 110, 14),
      seg(CX, BASE - 110, CX, BASE, soft),
      draw(`M ${CX - 196} ${BASE - 142} L ${CX - 196} ${BASE - 176} L ${CX + 196} ${BASE - 176} L ${CX + 196} ${BASE - 142}`),
      seg(CX - 196, BASE - 142, CX + 196, BASE - 142),
      seg(CX - 30, BASE - 196, CX + 30, BASE - 196, mark),
    ]
  }

  return [
    box(CX - 168, BASE - 168, 336, 168, 14),
    draw(`M ${CX - 182} ${BASE - 168} L ${CX - 182} ${BASE - 214} L ${CX + 182} ${BASE - 214} L ${CX + 182} ${BASE - 168}`),
    seg(CX - 182, BASE - 168, CX + 182, BASE - 168),
    seg(CX - 168, BASE - 74, CX + 168, BASE - 74, soft),
    seg(CX - 34, BASE - 236, CX + 34, BASE - 236, mark),
  ]
}

export function renderProductArt({ shape, caption, label, options = {} }) {
  const drawShape = SHAPES[shape]
  if (!drawShape) {
    throw new Error(`Unknown catalogue art shape: ${shape}`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${escapeXml(label)}">
  <rect width="640" height="640" fill="${PAPER}"/>
  <path d="M 120 478 L 520 478" stroke="${HAIRLINE}" stroke-width="4" stroke-linecap="round" fill="none"/>
  <g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
${drawShape(options).join('\n')}
  </g>
  <text x="320" y="558" text-anchor="middle" fill="${CAPTION}" font-family="${FONT}" font-size="34">${escapeXml(caption)}</text>
</svg>
`
}
