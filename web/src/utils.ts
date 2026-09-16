import type { CornerRadii, Node, NodeType } from './types'
import { NODE_TYPE_LABEL } from './types'

let counter = 0
export function uid(): string {
  counter = (counter + 1) % 1679616
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  const seq = counter.toString(36)
  return `n_${time}${rand}${seq}`.slice(0, 20)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shear'
  )
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Find a node by id anywhere in the tree. */
export function findNode(nodes: Node[], id: string): { node: Node; parent: Node | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.id === id) return { node: n, parent: null, index: i }
    if (n.children) {
      const hit = findNode(n.children, id)
      if (hit) return { node: hit.node, parent: n, index: hit.index }
    }
  }
  return null
}

/** Paint order: depth-first, parents before children. */
export function flatten(nodes: Node[]): Node[] {
  const out: Node[] = []
  const walk = (list: Node[]) => {
    for (const n of list) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function ptsAttr(pts: [number, number][], ox = 0, oy = 0): string {
  return pts.map(([x, y]) => `${round1(ox + x)},${round1(oy + y)}`).join(' ')
}

/** Regular-shape outline inscribed in the node box (local coordinates). */
export function polyPoints(n: Node): [number, number][] {
  const w = n.width
  const h = n.height
  const kind = n.poly?.kind ?? 'triangle'
  const cx = w / 2
  const cy = h / 2
  const pts: [number, number][] = []
  if (kind === 'star') {
    const spikes = Math.max(3, n.poly?.sides ?? 5)
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? 1 : 0.45
      const a = (Math.PI * i) / spikes - Math.PI / 2
      pts.push([cx + Math.cos(a) * r * cx, cy + Math.sin(a) * r * cy])
    }
  } else {
    const sides = kind === 'triangle' ? 3 : Math.max(3, n.poly?.sides ?? 6)
    for (let i = 0; i < sides; i++) {
      const a = (2 * Math.PI * i) / sides - Math.PI / 2
      pts.push([cx + Math.cos(a) * cx, cy + Math.sin(a) * cy])
    }
  }
  return pts
}

export function lineEnds(n: Node): [number, number, number, number] {
  return n.flip ? [n.width, 0, 0, n.height] : [0, 0, n.width, n.height]
}

/** Arrow-head triangle at the line's end point (local coordinates). */
export function arrowHead(n: Node): [number, number][] {
  const [x1, y1, x2, y2] = lineEnds(n)
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const len = Math.max(10, (n.stroke?.width ?? 2) * 4)
  const bx = x2 - Math.cos(ang) * len
  const by = y2 - Math.sin(ang) * len
  const px = Math.cos(ang + Math.PI / 2)
  const py = Math.sin(ang + Math.PI / 2)
  const w2 = len * 0.45
  return [
    [x2, y2],
    [bx + px * w2, by + py * w2],
    [bx - px * w2, by - py * w2],
  ]
}

export function defaultCornerRadii(v = 0): CornerRadii {
  return { tl: v, tr: v, br: v, bl: v, linked: true }
}

export function makeNode(type: NodeType, x: number, y: number, w: number, h: number): Node {
  const base: Node = {
    id: uid(),
    name: NODE_TYPE_LABEL[type],
    type,
    x: round1(x),
    y: round1(y),
    width: round1(Math.max(1, w)),
    height: round1(Math.max(1, h)),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: type === 'rect' || type === 'ellipse' ? '#ffffff' : null,
    stroke: null,
    effects: [],
  }
  switch (type) {
    case 'rect':
      base.cornerRadius = 0
      base.cornerRadii = defaultCornerRadii(0)
      break
    case 'ellipse':
      break
    case 'poly':
      base.fill = '#ffffff'
      base.poly = { kind: 'triangle' }
      break
    case 'line':
      base.fill = null
      base.stroke = { color: '#ffffff', width: 2 }
      base.height = Math.max(1, h)
      break
    case 'text':
      base.fill = null
      base.width = 200
      base.height = 32
      base.text = { content: 'Text', fontSize: 24, fontWeight: 400, color: '#ffffff', align: 'left' }
      break
    case 'icon':
      base.fill = null
      base.icon = { svg: '', color: '#ffffff' }
      break
  }
  return base
}

/** Auto-incremented friendly name: "Rectangle 3". */
export function nextName(nodes: Node[], type: NodeType): string {
  const label = NODE_TYPE_LABEL[type]
  let max = 0
  const re = new RegExp(`^${label} (\\d+)$`)
  const walk = (list: Node[]) => {
    for (const n of list) {
      const m = re.exec(n.name)
      if (m) max = Math.max(max, parseInt(m[1], 10))
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return `${label} ${max + 1}`
}

/** hex color + 0..1 alpha → #rrggbbaa (omitted when fully opaque) */
export function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0')
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  return `#${full}${a}`
}
