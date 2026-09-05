import type { Adjust, AnimProp, Keyframe, KeyValue, Node, Timeline, Track } from './types'
import { uid } from './utils'

/**
 * Named easing curves. The first few are the system curves Apple uses for
 * interface motion — gentle in, decisive out, nothing bouncy.
 */
export const EASING_PRESETS: { id: string; label: string; value: [number, number, number, number] }[] = [
  { id: 'standard', label: 'Standard', value: [0.25, 0.1, 0.25, 1] },
  { id: 'smooth', label: 'Smooth', value: [0.42, 0, 0.58, 1] },
  { id: 'out', label: 'Ease out', value: [0, 0, 0.58, 1] },
  { id: 'in', label: 'Ease in', value: [0.42, 0, 1, 1] },
  { id: 'snappy', label: 'Snappy', value: [0.16, 1, 0.3, 1] },
  { id: 'linear', label: 'Linear', value: [0, 0, 1, 1] },
]

export const DEFAULT_EASING: [number, number, number, number] = [0.25, 0.1, 0.25, 1]

export function defaultAdjust(): Adjust {
  return { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0, blur: 0, grayscale: 0, invert: 0 }
}

export function emptyTimeline(): Timeline {
  return { duration: 2, trigger: 'view', loop: false, tracks: [] }
}

/** Ranges for each animatable property, used by sliders and the editor. */
export const PROP_RANGE: Record<AnimProp, { min: number; max: number; step: number; suffix?: string }> = {
  x: { min: -4000, max: 4000, step: 1 },
  y: { min: -4000, max: 4000, step: 1 },
  width: { min: 1, max: 4000, step: 1 },
  height: { min: 1, max: 4000, step: 1 },
  rotation: { min: -720, max: 720, step: 1, suffix: '°' },
  opacity: { min: 0, max: 1, step: 0.01 },
  scale: { min: 0, max: 4, step: 0.01 },
  fill: { min: 0, max: 0, step: 0 },
  blur: { min: 0, max: 50, step: 0.5 },
  brightness: { min: -100, max: 100, step: 1 },
  contrast: { min: -100, max: 100, step: 1 },
  saturation: { min: -100, max: 100, step: 1 },
  hue: { min: -180, max: 180, step: 1, suffix: '°' },
  radius: { min: 0, max: 400, step: 1 },
}

export function isColorProp(p: AnimProp): boolean {
  return p === 'fill'
}

/** The node's current value for a property — the starting point of a track. */
export function currentValue(n: Node, p: AnimProp): KeyValue {
  const a = { ...defaultAdjust(), ...(n.adjust ?? {}) }
  switch (p) {
    case 'x': return n.x
    case 'y': return n.y
    case 'width': return n.width
    case 'height': return n.height
    case 'rotation': return n.rotation
    case 'opacity': return n.opacity
    case 'scale': return 1
    case 'fill': return n.fill ?? '#ffffff'
    case 'blur': return a.blur
    case 'brightness': return a.brightness
    case 'contrast': return a.contrast
    case 'saturation': return a.saturation
    case 'hue': return a.hue
    case 'radius': return n.cornerRadius ?? 0
  }
}

export function makeKey(time: number, value: KeyValue): Keyframe {
  return { id: uid(), time: Math.max(0, Math.round(time * 100) / 100), value, easing: [...DEFAULT_EASING] }
}

export function makeTrack(property: AnimProp, node: Node): Track {
  return { id: uid(), property, keys: [makeKey(0, currentValue(node, property))] }
}

/** Keys are kept sorted so sampling is a simple scan. */
export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.time - b.time)
}

// ---------------------------------------------------------------- easing

/** Cubic bézier solver — the same curve the browser applies to CSS easing. */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x
      if (Math.abs(err) < 1e-5) return sampleY(t)
      const d = slopeX(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 24; i++) {
      const v = sampleX(t)
      if (Math.abs(v - x) < 1e-5) break
      if (v > x) hi = t
      else lo = t
      t = (lo + hi) / 2
    }
    return sampleY(t)
  }
}

export function easingCSS(e: [number, number, number, number]): string {
  return `cubic-bezier(${e.map((v) => Math.round(v * 1000) / 1000).join(', ')})`
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ---------------------------------------------------------------- colour

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const v = parseInt(full || 'ffffff', 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

export function lerpValue(a: KeyValue, b: KeyValue, t: number): KeyValue {
  if (typeof a === 'string' || typeof b === 'string') {
    return lerpColor(String(a), String(b), t)
  }
  return lerp(a, b, t)
}

// ---------------------------------------------------------------- sampling

/**
 * Value of a track at time `t`. Before the first key it holds the first
 * value; after the last it holds the last. Between two keys it eases with
 * the curve stored on the key being left.
 */
export function sampleTrack(track: Track, t: number): KeyValue | undefined {
  const keys = sortKeys(track.keys)
  if (keys.length === 0) return undefined
  if (keys.length === 1 || t <= keys[0].time) return keys[0].value
  const last = keys[keys.length - 1]
  if (t >= last.time) return last.value

  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time
      const raw = span <= 0 ? 1 : (t - a.time) / span
      const eased = cubicBezier(...a.easing)(raw)
      return lerpValue(a.value, b.value, eased)
    }
  }
  return last.value
}

/** Longest keyframe time on a timeline — used to size the ruler. */
export function timelineLength(tl: Timeline): number {
  let max = 0
  for (const tr of tl.tracks) for (const k of tr.keys) max = Math.max(max, k.time)
  return Math.max(max, 0.1)
}

export function hasTimeline(n: Node): boolean {
  return !!n.timeline && n.timeline.tracks.some((t) => t.keys.length > 0)
}

/**
 * The node as it appears at time `t`: every keyframed property replaced by
 * its sampled value. Everything else is left exactly as authored.
 */
export function resolveNode(n: Node, t: number): Node {
  const tl = n.timeline
  if (!tl || tl.tracks.length === 0) return n

  const time = tl.loop && tl.duration > 0 ? t % tl.duration : Math.min(t, tl.duration)
  const out: Node = { ...n }
  const adjust: Adjust = { ...defaultAdjust(), ...(n.adjust ?? {}) }
  let adjusted = false
  let scale: number | null = null

  for (const track of tl.tracks) {
    const v = sampleTrack(track, time)
    if (v === undefined) continue
    switch (track.property) {
      case 'x': out.x = Number(v); break
      case 'y': out.y = Number(v); break
      case 'width': out.width = Number(v); break
      case 'height': out.height = Number(v); break
      case 'rotation': out.rotation = Number(v); break
      case 'opacity': out.opacity = Number(v); break
      case 'scale': scale = Number(v); break
      case 'fill': out.fill = String(v); break
      case 'radius': {
        const r = Number(v)
        out.cornerRadius = r
        out.cornerRadii = { tl: r, tr: r, br: r, bl: r, linked: true }
        break
      }
      case 'blur': adjust.blur = Number(v); adjusted = true; break
      case 'brightness': adjust.brightness = Number(v); adjusted = true; break
      case 'contrast': adjust.contrast = Number(v); adjusted = true; break
      case 'saturation': adjust.saturation = Number(v); adjusted = true; break
      case 'hue': adjust.hue = Number(v); adjusted = true; break
    }
  }

  // Scale is expressed around the object's centre so it doesn't drift.
  if (scale !== null && scale !== 1) {
    const cx = out.x + out.width / 2
    const cy = out.y + out.height / 2
    out.width *= scale
    out.height *= scale
    out.x = cx - out.width / 2
    out.y = cy - out.height / 2
  }

  if (adjusted) out.adjust = adjust
  return out
}

/** Resolve a whole tree at time `t`. */
export function resolveNodes(nodes: Node[], t: number): Node[] {
  return nodes.map((n) => {
    const r = resolveNode(n, t)
    return r.children ? { ...r, children: resolveNodes(r.children, t) } : r
  })
}

/** Longest timeline in a tree, so preview knows when the scene is done. */
export function sceneDuration(nodes: Node[]): number {
  let max = 0
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.timeline && n.timeline.tracks.length > 0) max = Math.max(max, n.timeline.duration)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return max
}

/** True if anything in the tree loops forever. */
export function sceneLoops(nodes: Node[]): boolean {
  let loops = false
  const walk = (list: Node[]) => {
    for (const n of list) {
      if (n.timeline?.loop && n.timeline.tracks.length > 0) loops = true
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return loops
}

// ---------------------------------------------------------------- filters

/**
 * Adjustments as a CSS/canvas filter string. Offsets are converted to the
 * multipliers CSS expects, so 0 produces no filter at all.
 */
export function adjustCSS(a: Adjust | undefined): string {
  if (!a) return ''
  const parts: string[] = []
  if (a.brightness) parts.push(`brightness(${(100 + a.brightness) / 100})`)
  if (a.contrast) parts.push(`contrast(${(100 + a.contrast) / 100})`)
  if (a.saturation) parts.push(`saturate(${(100 + a.saturation) / 100})`)
  if (a.temperature) {
    // Warm pushes toward amber, cool toward blue — a hue nudge plus a
    // touch of saturation reads closer to a real white-balance control
    // than sepia does.
    parts.push(`sepia(${Math.abs(a.temperature) / 100 * 0.5})`)
    parts.push(`hue-rotate(${a.temperature < 0 ? 180 : 0}deg)`)
    parts.push(`saturate(${1 + Math.abs(a.temperature) / 200})`)
  }
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`)
  if (a.blur) parts.push(`blur(${a.blur}px)`)
  if (a.grayscale) parts.push(`grayscale(${a.grayscale / 100})`)
  if (a.invert) parts.push(`invert(${a.invert / 100})`)
  return parts.join(' ')
}

// ---------------------------------------------------------------- auto-key

/** Which track a node property belongs to, if any. */
const PROP_OF_FIELD: Record<string, AnimProp> = {
  x: 'x',
  y: 'y',
  width: 'width',
  height: 'height',
  rotation: 'rotation',
  opacity: 'opacity',
  fill: 'fill',
  cornerRadius: 'radius',
}

const PROP_OF_ADJUST: Record<string, AnimProp> = {
  blur: 'blur',
  brightness: 'brightness',
  contrast: 'contrast',
  saturation: 'saturation',
  hue: 'hue',
}

function upsertKey(track: Track, time: number, value: KeyValue): Track {
  const at = track.keys.find((k) => Math.abs(k.time - time) < 0.02)
  if (at) {
    return { ...track, keys: track.keys.map((k) => (k.id === at.id ? { ...k, value } : k)) }
  }
  return { ...track, keys: sortKeys([...track.keys, makeKey(time, value)]) }
}

/**
 * After an edit, record the new values as keyframes at the playhead.
 *
 * Without this, editing a keyframed property looks broken: the canvas
 * samples the track every frame and immediately overwrites whatever you
 * just dragged, so the object appears pinned to its animated path. This
 * is the auto-keyframe behaviour a motion editor is expected to have —
 * change something while a track exists and you get a key for it.
 */
export function syncKeyframes(before: Node, after: Node, time: number): Node {
  const tl = after.timeline
  if (!tl || tl.tracks.length === 0) return after

  let tracks = tl.tracks
  let changed = false

  for (const [field, prop] of Object.entries(PROP_OF_FIELD)) {
    const b = (before as unknown as Record<string, unknown>)[field]
    const a = (after as unknown as Record<string, unknown>)[field]
    if (a === undefined || a === b) continue
    const i = tracks.findIndex((t) => t.property === prop)
    if (i === -1) continue
    tracks = tracks.map((t, j) => (j === i ? upsertKey(t, time, a as KeyValue) : t))
    changed = true
  }

  if (before.adjust || after.adjust) {
    const ba = { ...defaultAdjust(), ...(before.adjust ?? {}) }
    const aa = { ...defaultAdjust(), ...(after.adjust ?? {}) }
    for (const [field, prop] of Object.entries(PROP_OF_ADJUST)) {
      const b = (ba as unknown as Record<string, number>)[field]
      const a = (aa as unknown as Record<string, number>)[field]
      if (a === b) continue
      const i = tracks.findIndex((t) => t.property === prop)
      if (i === -1) continue
      tracks = tracks.map((t, j) => (j === i ? upsertKey(t, time, a) : t))
      changed = true
    }
  }

  return changed ? { ...after, timeline: { ...tl, tracks } } : after
}

/** Apply syncKeyframes across two versions of a node tree. */
export function syncTree(before: Node[], after: Node[], time: number): Node[] {
  const index = new Map<string, Node>()
  const walk = (list: Node[]) => {
    for (const n of list) {
      index.set(n.id, n)
      if (n.children) walk(n.children)
    }
  }
  walk(before)

  const map = (list: Node[]): Node[] =>
    list.map((n) => {
      const prev = index.get(n.id)
      const synced = prev ? syncKeyframes(prev, n, time) : n
      return synced.children ? { ...synced, children: map(synced.children) } : synced
    })
  return map(after)
}
