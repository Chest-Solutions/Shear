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
    fill: type === 'rect' || type === 'frame' ? '#ffffff' : type === 'ellipse' ? '#ffffff' : null,
    stroke: null,
    effects: [],
  }
  switch (type) {
    case 'frame':
      base.fill = null
      base.children = []
      base.cornerRadius = 0
      base.cornerRadii = defaultCornerRadii(0)
      break
    case 'rect':
      base.cornerRadius = 0
      base.cornerRadii = defaultCornerRadii(0)
      break
    case 'ellipse':
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
