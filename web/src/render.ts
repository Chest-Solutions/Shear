import type { CornerRadii, Node, Scene } from './types'

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

function filters(n: Node): string {
  const f = n.filters
  const parts: string[] = []
  for (const e of n.effects ?? []) if (e.visible && e.type === 'layer-blur' && e.blur > 0) parts.push(`blur(${e.blur}px)`)
  if (f) {
    if (f.blur) parts.push(`blur(${f.blur}px)`)
    if (f.invert) parts.push(`invert(${f.invert}%)`)
    if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`)
    if (f.sepia) parts.push(`sepia(${f.sepia}%)`)
    if (f.brightness !== undefined && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`)
    if (f.contrast !== undefined && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`)
    if (f.saturate !== undefined && f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`)
    if (f.hueRotate) parts.push(`hue-rotate(${f.hueRotate}deg)`)
  }
  return parts.join(' ') || 'none'
}

function drawText(ctx: CanvasRenderingContext2D, n: Node) {
  const t = n.text
  if (!t) return
  ctx.fillStyle = t.color
  ctx.font = `${t.fontWeight} ${t.fontSize}px ${UI_FONT}`
  ctx.textAlign = t.align
  ctx.textBaseline = 'top'
  const lines = t.content.split('\n')
  const lineHeight = t.fontSize * 1.3
  const x = t.align === 'left' ? 0 : t.align === 'center' ? n.width / 2 : n.width
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue
    const y = i * lineHeight + (lineHeight - t.fontSize) / 2
    ctx.fillText(lines[i], x, y)
  }
}

function drawGeometry(ctx: CanvasRenderingContext2D, n: Node, shadow = false) {
  const r = radii(n)
  switch (n.type) {
    case 'rect':
    case 'frame': {
      if (n.fill) {
        roundedPath(ctx, 0, 0, n.width, n.height, r)
        ctx.fillStyle = n.fill
        ctx.fill()
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
      if (n.fill) {
        ctx.fillStyle = n.fill
        ctx.fill()
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
      ctx.beginPath()
      if (n.flip) {
        ctx.moveTo(n.width, 0)
        ctx.lineTo(0, n.height)
      } else {
        ctx.moveTo(0, 0)
        ctx.lineTo(n.width, n.height)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.lineCap = 'round'
      ctx.stroke()
      break
    }
    case 'text':
      if (!shadow) drawText(ctx, n)
      break
  }
}

export function drawNode(ctx: CanvasRenderingContext2D, n: Node) {
  if (!n.visible) return
  ctx.save()
  ctx.globalAlpha = n.opacity
  ctx.translate(n.x + n.width / 2, n.y + n.height / 2)
  if (n.rotation !== 0) ctx.rotate((n.rotation * Math.PI) / 180)
  ctx.translate(-n.width / 2, -n.height / 2)

  // Canvas supports CSS-like filters, so Shear now exposes many CSS effects directly.
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
      if (n.type === 'rect' || n.type === 'frame') roundedPath(ctx, 0, 0, n.width, n.height, r)
      else if (n.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(n.width / 2, n.height / 2, n.width / 2, n.height / 2, 0, 0, Math.PI * 2) }
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
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 4
  ctx.fillStyle = scene.background
  ctx.fillRect(0, 0, scene.width, scene.height)
  ctx.restore()

  // Figma-like artboard grid inside the scene: fine 10px divisions and bolder 100px divisions.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, scene.width, scene.height)
  ctx.clip()
  for (let x = 0; x <= scene.width; x += 10) {
    ctx.strokeStyle = x % 100 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.035)'
    ctx.lineWidth = x % 100 === 0 ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, scene.height); ctx.stroke()
  }
  for (let y = 0; y <= scene.height; y += 10) {
    ctx.strokeStyle = y % 100 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.035)'
    ctx.lineWidth = y % 100 === 0 ? 1 : 0.5
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(scene.width, y); ctx.stroke()
  }
  ctx.restore()

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
