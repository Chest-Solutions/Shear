import type { CornerRadii, Node, Scene } from './types'
import { adjustCSS } from './anim'
import { arrowHead, lineEnds, polyPoints } from './utils'

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

function radii(n: Node): CornerRadii {
  const r = n.cornerRadii
  const fallback = n.cornerRadius ?? 0
  return r ? { tl: r.tl ?? fallback, tr: r.tr ?? fallback, br: r.br ?? fallback, bl: r.bl ?? fallback, linked: r.linked ?? true } : { tl: fallback, tr: fallback, br: fallback, bl: fallback, linked: true }
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rr: number | CornerRadii) {
  const maxR = Math.max(0, Math.min(Math.abs(w) / 2, Math.abs(h) / 2))
  const r = typeof rr === 'number'
    ? { tl: Math.min(rr, maxR), tr: Math.min(rr, maxR), br: Math.min(rr, maxR), bl: Math.min(rr, maxR) }
    : { tl: Math.min(Math.max(0, rr.tl), maxR), tr: Math.min(Math.max(0, rr.tr), maxR), br: Math.min(Math.max(0, rr.br), maxR), bl: Math.min(Math.max(0, rr.bl), maxR) }
  ctx.beginPath()
  ctx.moveTo(x + r.tl, y)
  ctx.lineTo(x + w - r.tr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr)
  ctx.lineTo(x + w, y + h - r.br)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h)
  ctx.lineTo(x + r.bl, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl)
  ctx.lineTo(x, y + r.tl)
  ctx.quadraticCurveTo(x, y, x + r.tl, y)
  ctx.closePath()
}

const UI_FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Helvetica, Arial, sans-serif"

// ---- icon raster cache -------------------------------------------------
// Icons are stored as SVG markup; the canvas draws them through an Image
// decoded from a data-URL. Decoding is async, so the first draw shows a
// faint placeholder and `onIconReady` lets the canvas repaint once the
// glyphs land.

const iconImages = new Map<string, HTMLImageElement>()
const iconListeners = new Set<() => void>()

/** Subscribe to "an icon image finished decoding" — returns unsubscribe. */
export function onIconReady(fn: () => void): () => void {
  iconListeners.add(fn)
  return () => {
    iconListeners.delete(fn)
  }
}

function tintedIconSVG(n: Node): string {
  const color = n.icon?.color || '#ffffff'
  return (n.icon?.svg ?? '').split('currentColor').join(color)
}

function getIconImage(n: Node): HTMLImageElement | null {
  if (!n.icon?.svg) return null
  const key = (n.icon.color || '#ffffff') + '|' + n.icon.svg
  let img = iconImages.get(key)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tintedIconSVG(n))
    iconImages.set(key, img)
    img.onload = () => iconListeners.forEach((fn) => fn())
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

function filters(n: Node): string {
  const parts: string[] = []
  for (const e of n.effects ?? []) if (e.visible && e.type === 'layer-blur' && e.blur > 0) parts.push(`blur(${e.blur}px)`)
  const adj = adjustCSS(n.adjust)
  if (adj) parts.push(adj)
  return parts.join(' ') || 'none'
}

/** Gradient endpoints across a w×h box, matching the CSS/SVG exporters. */
export function gradientEnds(angle: number, w: number, h: number): [number, number, number, number] {
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2 || 1
  const cx = w / 2
  const cy = h / 2
  return [cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len]
}

export function paintFor(ctx: CanvasRenderingContext2D, n: Node, fallback: string | null): string | CanvasGradient | null {
  if (n.gradient && n.gradient.stops.length > 0) {
    const [x1, y1, x2, y2] = gradientEnds(n.gradient.angle, n.width, n.height)
    const g = ctx.createLinearGradient(x1, y1, x2, y2)
    for (const st of [...n.gradient.stops].sort((a, b) => a.pos - b.pos)) g.addColorStop(Math.min(1, Math.max(0, st.pos)), st.color)
    return g
  }
  return fallback
}

/** Word-wrap text into the node's width; explicit newlines still honoured. */
export function layoutTextLines(n: Node, measure: (txt: string) => number): string[] {
  const t = n.text
  if (!t) return []
  const out: string[] = []
  for (const raw of t.content.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length === 0) { out.push(''); continue }
    let line = words[0]
    for (const w of words.slice(1)) {
      const probe = line + ' ' + w
      if (measure(probe) <= n.width || measure(line) > n.width) line = probe
      else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}

function drawText(ctx: CanvasRenderingContext2D, n: Node) {
  const t = n.text
  if (!t) return
  const paint = paintFor(ctx, n, t.color)
  if (!paint) return
  ctx.fillStyle = paint
  ctx.font = `${t.fontWeight} ${t.fontSize}px ${UI_FONT}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'top'
  const lines = layoutTextLines(n, (txt) => ctx.measureText(txt).width)
  const lineHeight = t.fontSize * 1.3
  const x = t.align === 'left' ? 0 : t.align === 'center' ? n.width / 2 : n.width
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue
    const y = i * lineHeight + (lineHeight - t.fontSize) / 2
    ctx.fillText(lines[i], x, y)
  }
}

function polyPath(ctx: CanvasRenderingContext2D, n: Node) {
  const pts = polyPoints(n)
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
}

function drawGeometry(ctx: CanvasRenderingContext2D, n: Node, shadow = false) {
  const r = radii(n)
  switch (n.type) {
    case 'frame':
      // legacy frames are invisible containers — only their children draw
      break
    case 'rect': {
      if (n.fill || n.gradient) {
        roundedPath(ctx, 0, 0, n.width, n.height, r)
        const paint = paintFor(ctx, n, n.fill)
        if (paint) { ctx.fillStyle = paint; ctx.fill() }
      }
      if (!shadow && n.stroke && n.stroke.width > 0) {
        roundedPath(ctx, 0, 0, n.width, n.height, r)
        ctx.strokeStyle = n.stroke.color
        ctx.lineWidth = n.stroke.width
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      break
    }
    case 'ellipse': {
      ctx.beginPath()
      ctx.ellipse(n.width / 2, n.height / 2, Math.max(0, n.width / 2), Math.max(0, n.height / 2), 0, 0, Math.PI * 2)
      if (n.fill || n.gradient) {
        const paint = paintFor(ctx, n, n.fill)
        if (paint) { ctx.fillStyle = paint; ctx.fill() }
      }
      if (!shadow && n.stroke && n.stroke.width > 0) {
        ctx.strokeStyle = n.stroke.color
        ctx.lineWidth = n.stroke.width
        ctx.stroke()
      }
      break
    }
    case 'line': {
      const w = n.stroke?.width ?? 2
      const color = n.stroke?.color ?? '#ffffff'
      const [x1, y1, x2, y2] = lineEnds(n)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      if (n.arrow) {
        // stop the shaft where the head begins
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const len = Math.max(10, w * 4) * 0.7
        ctx.lineTo(x2 - Math.cos(ang) * len, y2 - Math.sin(ang) * len)
      } else {
        ctx.lineTo(x2, y2)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.lineCap = 'round'
      ctx.stroke()
      if (n.arrow) {
        const head = arrowHead(n)
        ctx.beginPath()
        ctx.moveTo(head[0][0], head[0][1])
        ctx.lineTo(head[1][0], head[1][1])
        ctx.lineTo(head[2][0], head[2][1])
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
      }
      break
    }
    case 'poly': {
      if (n.fill || n.gradient) {
        polyPath(ctx, n)
        const paint = paintFor(ctx, n, n.fill)
        if (paint) { ctx.fillStyle = paint; ctx.fill() }
      }
      if (!shadow && n.stroke && n.stroke.width > 0) {
        polyPath(ctx, n)
        ctx.strokeStyle = n.stroke.color
        ctx.lineWidth = n.stroke.width
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      break
    }
    case 'text':
      if (!shadow) drawText(ctx, n)
      break
    case 'icon': {
      if (shadow) break
      const img = getIconImage(n)
      if (img) {
        ctx.drawImage(img, 0, 0, n.width, n.height)
      } else {
        // placeholder until the glyph decodes
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, 0.5, Math.max(0, n.width - 1), Math.max(0, n.height - 1))
      }
      break
    }
  }
}

export function drawNode(ctx: CanvasRenderingContext2D, n: Node) {
  if (!n.visible) return
  ctx.save()
  ctx.globalAlpha = n.opacity
  ctx.translate(n.x + n.width / 2, n.y + n.height / 2)
  if (n.rotation !== 0) ctx.rotate((n.rotation * Math.PI) / 180)
  ctx.translate(-n.width / 2, -n.height / 2)

  // Canvas takes the same filter syntax as CSS, so adjustments render
  // identically on the canvas and in preview/export.
  ctx.filter = filters(n)
  const r = radii(n)

  for (const e of n.effects ?? []) {
    if (!e.visible || (e.type !== 'drop-shadow' && e.type !== 'inner-shadow')) continue
    ctx.save()
    ctx.shadowColor = e.color
    ctx.shadowBlur = Math.max(0, e.blur)
    ctx.shadowOffsetX = e.x
    ctx.shadowOffsetY = e.y
    if (e.type === 'inner-shadow') {
      // A fast canvas approximation: clip to the object and cast the shadow from
      // an oversized surrounding shape back into it.
      if (n.type === 'rect') roundedPath(ctx, 0, 0, n.width, n.height, r)
      else if (n.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(n.width / 2, n.height / 2, n.width / 2, n.height / 2, 0, 0, Math.PI * 2) }
      else if (n.type === 'poly') polyPath(ctx, n)
      ctx.clip()
    }
    if (e.spread) {
      const s = e.spread
      ctx.translate(-s, -s)
      ctx.scale((n.width + s * 2) / Math.max(1, n.width), (n.height + s * 2) / Math.max(1, n.height))
    }
    drawGeometry(ctx, n, true)
    ctx.restore()
  }

  drawGeometry(ctx, n)
  ctx.restore()

  if (n.children) {
    ctx.save()
    ctx.translate(n.x + n.width / 2, n.y + n.height / 2)
    if (n.rotation !== 0) ctx.rotate((n.rotation * Math.PI) / 180)
    ctx.translate(-n.width / 2, -n.height / 2)
    for (const c of n.children) drawNode(ctx, c)
    ctx.restore()
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene) {
  // no artboard: the workspace is open space; a "canvas" is just a shape
  for (const n of scene.nodes) drawNode(ctx, n)
}

/**
 * World-space transform helpers.
 * screen = world * zoom + pan
 */
export function worldToScreen(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: x * vp.zoom + vp.panX, y: y * vp.zoom + vp.panY }
}

export function screenToWorld(vp: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: (x - vp.panX) / vp.zoom, y: (y - vp.panY) / vp.zoom }
}
